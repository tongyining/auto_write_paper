// workflows/paper-generation/utils.js

// ---------- 修复不规范的 JSON ----------
function repairJSON(str) {
    // 去除末尾多余逗号（在 } 或 ] 之前）
    str = str.replace(/,\s*([}\]])/g, '$1');
    // 将属性名（单引号或没有引号）转为双引号
    str = str.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
    return str;
}

// ---------- 从大纲文本中提取一级标题（章节标题） ----------
function extractChaptersFromOutline(outlineText) {
    const lines = outlineText.split('\n');
    const chapters = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
            chapters.push(trimmed.replace(/^# /, '').trim());
        } else if (trimmed.match(/^[0-9]+\.\s+/)) {
            chapters.push(trimmed.replace(/^[0-9]+\.\s+/, '').trim());
        }
    }
    if (chapters.length < 3) {
        // 默认补充
        return ['绪论', '现状分析', '问题剖析', '解决方案', '结论'];
    }
    return chapters;
}

// ---------- 将嵌套的大纲章节展平为叶子节点列表 ----------
function flattenChapters(chapters, parentPath = []) {
    let result = [];
    for (const ch of chapters) {
        const path = [...parentPath, ch.title];
        if (ch.children && ch.children.length > 0) {
            result = result.concat(flattenChapters(ch.children, path));
        } else {
            result.push({
                ...ch,
                path: path,
                level: ch.level || 1,
                features: ch.features || []
            });
        }
    }
    return result;
}

// ---------- 去除内容开头可能存在的与章节标题重复的一级标题 ----------
function stripLeadingTitle(content, chapterTitle) {
    const lines = content.split('\n');
    let startIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('# ')) {
            const titlePart = trimmed.replace(/^#+\s*/, '').trim();
            if (titlePart.includes(chapterTitle) || chapterTitle.includes(titlePart)) {
                startIdx = i + 1;
                while (startIdx < lines.length && lines[startIdx].trim() === '') {
                    startIdx++;
                }
                break;
            }
        }
    }
    if (startIdx === 0) return content;
    return lines.slice(startIdx).join('\n');
}

// ---------- 构建章节提示词（根据章节对象和特性） ----------
function buildChapterPrompt(chapter, title, degreeName, contextText, feedContent, targetWords, outlineStr) {
    const { title: chTitle, desc, children = [] } = chapter;
    console.log(74, `[buildChapterPrompt] 章节标题: "${chTitle}"`, JSON.stringify(chapter));
    let prompt = `请撰写论文《${title}》的“${chTitle}”章节（${degreeName}论文）。\n`;
    if (desc) prompt += `本章核心内容：${desc}\n`;
    if (feedContent) prompt += `参考材料：${feedContent}\n`;

    // ---- 新增：递归遍历叶子节点，收集针对性的插入指令 ----
    let leafInstructions = [];
    function traverse(node, path) {
        // path 为从根到当前节点的标题数组，用于定位
        const currentPath = [...path, node.title];
        console.log(84, `[traverse] 当前节点: "${node.title}", level: ${node.level}, children: ${node.children ? node.children.length : 0}, features:`, node.features);
        if (!node.children || node.children.length === 0) {
            // 叶子节点
            const feats = node.features || [];
            console.log(88, `[traverse] 叶子节点 "${node.title}" 的 features:`, feats);
            if (feats.includes('table')) {
                leafInstructions.push(`- 在小节“${node.title}”中插入一张数据表，表格内容应与该小节论述紧密相关，表头清晰，并标注表名和来源。`);
                console.log(91, `[traverse] → 为叶子节点 "${node.title}" 添加 table 指令`);
            }
            if (feats.includes('chart')) {
                leafInstructions.push(`- 在小节“${node.title}”中插入一张数据图（如柱状图、折线图），描述数据趋势，并标注图名。`);
            }
            if (feats.includes('code')) {
                leafInstructions.push(`- 在小节“${node.title}”中插入一段代码示例，说明算法或实现逻辑，并注释关键步骤。`);
            }
            if (feats.includes('formula')) {
                leafInstructions.push(`- 在小节“${node.title}”中插入数学公式，编号并解释符号含义。`);
            }
        } else {
            node.children.forEach(child => traverse(child, currentPath));
        }
    }
    traverse(chapter, []);
    console.log(107, `[buildChapterPrompt] 收集到的 leafInstructions 数量: ${leafInstructions.length}`);
    console.log(108, `[buildChapterPrompt] leafInstructions 内容:`, leafInstructions);

    if (leafInstructions.length > 0) {
        prompt += '\n**针对以下小节的具体要求：**\n' + leafInstructions.join('\n') + '\n';
    }

    // ---- 修改点：下限 = targetWords * 1.1，上限 = targetWords * 1.3 ----
    const minWords = Math.floor(targetWords * 1.1);
    const maxWords = Math.floor(targetWords * 1.3);
    prompt += `要求字数：${minWords} 至 ${maxWords} 字（请尽量接近上限，但不得低于 ${minWords} 字）。\n`;
    // ---------------------------------------------------------------

    prompt += `内容需学术严谨，逻辑清晰，引用真实文献。\n`;
    if (contextText) {
        prompt += `\n### 整体背景（包含领域分析、文献综述等）：\n${contextText}\n`;
    }
    // 强制包含本章完整结构（含三级标题）
    prompt += `\n**本章必须严格按照以下大纲结构撰写，包含所有一级、二级、三级标题，不得遗漏任何级别。**\n`;
    prompt += `大纲结构如下：\n${outlineStr}\n`;

    prompt += `\n**输出格式要求**：\n`;
    prompt += `- 直接以一级标题 "# ${chTitle}" 开头，然后换行写正文。\n`;
    prompt += `- 内部小节（二级、三级）必须使用相应的Markdown标题（##、###），保持与上述大纲结构完全一致。\n`;
    prompt += `- 正文段落中不要使用数字序号列表（1. 2. 3.）来组织内容。\n`;
    prompt += `- 语言自然流畅，避免生硬罗列。\n`;
    prompt += `\n**重要：在本章内容结束后，必须另起一行，输入“---”（三个短横线作为分隔线），然后换行输入“**参考文献**”，再换行按顺序列出至少3~5条本章引用的参考文献，格式为GB/T 7714（如[1] 作者. 题名[J]. 刊名, 年, 卷(期): 页码.）。**\n`;
    prompt = `**重要格式指令**：\n` +
         `- 本章必须严格使用 Markdown 标题层级：一级标题 #，二级标题 ##，三级标题 ###。\n` +
         `- 大纲中每一级标题（包括 ###）都必须在正文中出现，不得合并或省略。\n` +
         `- 如果大纲有三级的“1 国家战略与政策导向（仅供参考的三级标题）”，则正文中必须写出 “### 1 国家战略与政策导向”。\n` +
         `- 任何缺失三级标题的回复都将被视为不合格。\n\n` +
         prompt;

    return prompt;
}

/**
 * 将用户输入的纯文本大纲（Markdown 标题）解析为系统 JSON 格式
 * @param {string} text - 用户粘贴的大纲文本，如：
 *   # 第一章 绪论
 *   ## 一、研究背景
 *   ### 1 国家战略
 *   ### 2 现实需求
 *   ## 二、文献综述
 *   ...
 * @param {string} title - 论文标题（默认从文本第一个 # 提取）
 * @returns {object} - 与 /api/generate-outline 返回格式一致
 */
function parseOutlineFromText(text, title = '') {
    const lines = text.split('\n');
    const chapters = [];
    let stack = []; // 用于构建树形结构，每层存放 { level, node, childrenRef }

    // 正则匹配 Markdown 标题： # 、## 、### 等
    const headingRegex = /^(#{1,3})\s+(.*)$/;

    for (const line of lines) {
        const trimmed = line.trim();
        const match = trimmed.match(headingRegex);
        if (!match) continue;

        const level = match[1].length; // 1、2、3
        const titleText = match[2].trim();

        const newNode = {
            level: level,
            title: titleText,
            desc: '', // 用户未提供描述，留空，可在编辑器中手动添加
            children: [],
            features: [] // 默认无特性，可由用户后续编辑添加
        };

        // 如果 level == 1，作为新章节
        if (level === 1) {
            // 若已有根节点，则结束当前章节
            chapters.push(newNode);
            stack = [{ level, node: newNode, childrenRef: newNode.children }];
        } else {
            // 寻找合适的父节点：从栈顶向前找，直到 level-1
            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            if (stack.length === 0) {
                // 如果没有父节点，则作为独立章节（但一般不会出现）
                chapters.push(newNode);
                stack = [{ level, node: newNode, childrenRef: newNode.children }];
            } else {
                const parent = stack[stack.length - 1];
                parent.childrenRef.push(newNode);
                stack.push({ level, node: newNode, childrenRef: newNode.children });
            }
        }
    }

    // 如果用户没有提供顶层标题，则使用第一个一级标题作为论文标题
    if (!title && chapters.length > 0 && chapters[0].level === 1) {
        title = chapters[0].title;
    }

    // 为每个节点生成唯一 id（与原逻辑一致）
    let idCounter = 0;
    function assignIds(node) {
        node.id = `n${++idCounter}`;
        if (node.children) {
            node.children.forEach(assignIds);
        }
    }
    chapters.forEach(assignIds);

    return {
        title: title || '未命名论文',
        chapters: chapters
    };
}


module.exports = {
    repairJSON,
    extractChaptersFromOutline,
    flattenChapters,
    stripLeadingTitle,
    buildChapterPrompt,
    parseOutlineFromText
};