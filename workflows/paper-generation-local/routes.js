// workflows/paper-generation/routes.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { generateFullThesisWithOutline, generateFullThesis } = require('./engine');
const { readTasks, writeTasks } = require('./taskManager');
const { callGLM } = require('./glmClient');
const { DEGREE_CONFIG } = require('./config_lunwen');
const { repairJSON } = require('./utils');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./userConfig');

// const { parseOutlineFromText } = require('./utils');

// ---------- POST /api/generate-outline ----------
router.post('/generate-outline', async (req, res) => {
    const config = await loadConfig();
    if (!config) {
        return res.status(400).json({ error: '请先配置 API Key 和模型（点击右上角齿轮设置）' });
    }
    console.log(22, '[生成大纲]', new Date().Format("yyyy-MM-dd hh:mm:ss"));
    try {
        const { title, degree = 'undergraduate', extraPrompt = '', feedContent, totalWords = 30000, feedback = '' } = req.body;
        if (!title) {
            return res.status(400).json({ error: '标题不能为空' });
        }
        const outlineLogId = uuidv4();
        const logFile = `outline_${outlineLogId}.log`;
        const config = DEGREE_CONFIG[degree] || DEGREE_CONFIG.undergraduate;
        const degreeName = config.degreeName;
        const chapterCount = config.chapters;

        let prompt = `你是一位学术论文写作专家，请为论文《${title}》生成一份详细的大纲（${degreeName}论文）。\n`;
        prompt += `论文总字数约 ${totalWords} 字，需包含 ${chapterCount} 章（含绪论和结论）。\n`;
        prompt += `输出格式必须是合法的JSON，结构如下：\n`;
        prompt += `{
  "title": "论文标题",
  "chapters": [
    {
      "level": 1,
      "title": "第一章 绪论",
      "desc": "本章概述...",
      "children": [
        {
          "level": 2,
          "title": "一、研究背景",
          "desc": "描述...",
          "children": [
            {
              "level": 3,
              "title": "1 背景子点",
              "desc": "详细描述...",
              "features": []
            }
          ]
        }
      ]
    },
    {
      "level": 1,
      "title": "第二章 文献综述",
      "desc": "本章概述...",
      "children": [
        {
          "level": 2,
          "title": "一、国外研究情况",
          "desc": "描述...",
          "children": [
            {
              "level": 3,
              "title": "1 相关概念界定",
              "desc": "详细描述...",
              "features": []
            }
          ]
        }
      ]
    }
  ]
}\n`;
        prompt += `- 每个章节必须包含 title 和 desc（描述）。\n`;
        prompt += `- level 取值 1、2、3，一级标题对应章（如“第一章 绪论”），二级为“一、XXX”，三级为“1 XXX”。\n`;
        prompt += `- **重要：三级标题的编号在每一章内部独立，从1开始，不跨章也不跨二级标题延续。**\n`;
        prompt += `  例如第一章的三级标题为1、2，第二章的三级标题也为1、2，以此类推。\n`;
        prompt += `- 绪论章应包含研究背景、文献综述、研究方法等；结论章总结成果。\n`;
        prompt += `- 主体部分（2~4章）应包含现状分析、问题剖析、解决方案等。\n`;
        prompt += `- 请根据学科特点合理分配内容，确保逻辑连贯。\n`;
        if (extraPrompt) prompt += `\n额外要求：${extraPrompt}\n`;
        if (feedContent) prompt += `\n参考材料：${feedContent}\n`;
        if (feedback) prompt += `\n用户对之前大纲的不满和建议：${feedback}\n`;
        prompt += `仅输出JSON，不要有任何额外文字。`;

        const requestEntry = `========== [请求] ==========\n[时间] ${new Date().toISOString()}\n[提示词长度] ${prompt.length}\n[提示词内容]\n${prompt}\n====================================\n`;

        const jsonStr = await callGLM(prompt);
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('未找到有效的JSON');
        const responseEntry = `========== [响应] ==========\n[时间] ${new Date().toISOString()}\n[回复长度] ${jsonStr.length}\n[回复内容]\n${jsonStr}\n====================================\n`;

        let jsonText = match[0];
        jsonText = repairJSON(jsonText);
        const outline = JSON.parse(jsonText);
        console.log(104, '接收到api返回 outline:', JSON.stringify(outline, null, 2));

        // 为每个节点生成唯一id
        let idCounter = 0;
        function assignIds(node) {
            node.id = `n${++idCounter}`;
            if (node.children) {
                node.children.forEach(assignIds);
            }
        }
        assignIds(outline);
        res.json(outline);
    } catch (err) {
        console.error('大纲生成失败:', err);
        res.status(500).json({ error: '大纲生成失败: ' + err.message });
    }
});
// ---------- POST /parse-custom-outline ----------
router.post('/parse-custom-outline', async (req, res) => {
    console.log(123, '========================================');
    console.log(124, '收到请求', new Date().Format("yyyy-MM-dd hh:mm:ss"));
    const config = await loadConfig();
    if (!config) {
        return res.status(400).json({ error: '请先配置 API Key 和模型（点击右上角齿轮设置）' });
    }
    const { text, title } = req.body;
    console.log(130, `文本长度: ${text ? text.length : 0}, 标题: ${title || '未提供'}`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
    
    if (!text || text.trim() === '') {
        console.warn('文本为空，返回400');
        return res.status(400).json({ error: '大纲文本不能为空' });
    }

    try {
        // 1. 构建提示词（强化三级标题编号规则）
        const prompt = buildParsePrompt(text, title);
        console.log(140, `提示词字符数: ${prompt.length}`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
        console.log(141, `提示词预览: ${prompt.substring(0, 200)}...`, new Date().Format("yyyy-MM-dd hh:mm:ss"));

        // 2. 调用AI
        console.log(144, '正在调用AI...', new Date().Format("yyyy-MM-dd hh:mm:ss"));
        const jsonStr = await callGLM(prompt);
        console.log(146, `AI返回内容长度: ${jsonStr.length}`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
        console.log(147, `AI返回预览: ${jsonStr.substring(0, 300)}...`, new Date().Format("yyyy-MM-dd hh:mm:ss"));

        // 3. 保存完整返回内容（调试用）
        const debugFilePath = path.join(__dirname, './debug_ai_response.txt');
        fs.writeFileSync(debugFilePath, jsonStr, 'utf-8');
        console.log(152, `完整返回已保存到 ${debugFilePath}`, new Date().Format("yyyy-MM-dd hh:mm:ss"));

        // 4. 提取JSON
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error('AI返回的内容中未找到有效的JSON对象');
        }
        let jsonText = match[0];

        // 5. 补全缺失的括号（防止截断）
        let openBraces = (jsonText.match(/\{/g) || []).length;
        let closeBraces = (jsonText.match(/\}/g) || []).length;
        let openBrackets = (jsonText.match(/\[/g) || []).length;
        let closeBrackets = (jsonText.match(/\]/g) || []).length;
        if (openBraces > closeBraces) {
            jsonText += '}'.repeat(openBraces - closeBraces);
            console.log(168, `补全了 ${openBraces - closeBraces} 个右大括号`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
        }
        if (openBrackets > closeBrackets) {
            jsonText += ']'.repeat(openBrackets - closeBrackets);
            console.log(172, `补全了 ${openBrackets - closeBrackets} 个右方括号`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
        }

        // 6. 修复常见JSON格式问题
        jsonText = repairJSON(jsonText);
        console.log(177, '修复后JSON长度:', jsonText.length, new Date().Format("yyyy-MM-dd hh:mm:ss"));
        console.log(178, '修复后JSON预览:', jsonText.substring(0, 300) + '...', new Date().Format("yyyy-MM-dd hh:mm:ss"));

        // 7. 解析JSON
        const outline = JSON.parse(jsonText);
        console.log(182, '解析成功', new Date().Format("yyyy-MM-dd hh:mm:ss"));

        // 8. ★★★ 新增：规范化标题编号（强制修正三级标题格式） ★★★
        normalizeOutlineTitles(outline);
        console.log(186, '标题编号规范化完成', new Date().Format("yyyy-MM-dd hh:mm:ss"));

        // 9. 为每个节点生成唯一ID
        let idCounter = 0;
        function assignIds(node) {
            node.id = `n${++idCounter}`;
            if (node.children) {
                node.children.forEach(assignIds);
            }
        }
        assignIds(outline);

        // 10. 返回结果
        console.log(199, '转换成功，返回结果', new Date().Format("yyyy-MM-dd hh:mm:ss"));
        res.json(outline);

    } catch (err) {
        console.error('处理失败:', err);
        console.error(err.stack);
        res.status(500).json({ error: '解析失败: ' + err.message });
    }
});

// ---------- 规范化标题编号（修正三级标题格式） ----------
function normalizeOutlineTitles(outline) {
    if (!outline.chapters) return;

    // ---------- 第一步：删除不需要的一级章节（摘要、关键词、参考文献） ----------
    outline.chapters = outline.chapters.filter(ch => {
        const title = ch.title.trim();
        const unwanted = ['摘要', '关键词', '参考文献', 'abstract', 'keyword', 'reference'];
        return !unwanted.some(keyword => title.includes(keyword));
    });

    if (outline.chapters.length === 0) return;

    const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

    outline.chapters.forEach((chapter) => {
        // ----- 2.1 重新编号二级标题（确保使用一、二、三...） -----
        if (chapter.children && chapter.children.length > 0) {
            let secIndex = 0;
            chapter.children.forEach((sec) => {
                if (sec.level === 2) {
                    const rawTitle = extractPlainTitle(sec.title);
                    const num = chineseNumbers[secIndex] || (secIndex + 1);
                    sec.title = `${num}、${rawTitle}`;
                    secIndex++;
                }
            });
        }

        // ----- 2.2 对每个二级标题下的三级标题独立编号（从1开始） -----
        if (chapter.children && chapter.children.length > 0) {
            chapter.children.forEach((sec) => {
                if (sec.level === 2 && sec.children && sec.children.length > 0) {
                    let thirdCounter = 1;
                    sec.children.forEach((third) => {
                        if (third.level === 3) {
                            const rawTitle = extractPlainTitle(third.title);
                            third.title = `${thirdCounter} ${rawTitle}`;
                            thirdCounter++;
                        }
                    });
                }
            });
        }
    });
}

// ---------- 提取标题中的纯文本（去除编号前缀） ----------
function extractPlainTitle(title) {
    // 去除常见编号前缀：如 "1.1.1", "1.", "1、", "一、", "（一）" 等
    // 保留后面的文字
    let cleaned = title.replace(/^[\d.]+[\s　]*/, '');      // 去除 "1.2.3 " 或 "1. "
    cleaned = cleaned.replace(/^[一二三四五六七八九十]+[、.．\s　]+/, ''); // 去除 "一、"
    cleaned = cleaned.replace(/^[（(][一二三四五六七八九十]+[）)]/, ''); // 去除 "（一）"
    cleaned = cleaned.replace(/^\d+[、.．\s　]+/, '');       // 去除 "1、"
    return cleaned.trim() || '未命名小节';
}

// ---------- 构建提示词（强化三级标题规则） ----------
function buildParsePrompt(userText, title) {
    let finalTitle = title;
    if (!finalTitle) {
        const firstLine = userText.split('\n')[0] || '';
        const match = firstLine.match(/^#\s+(.*)/);
        if (match) finalTitle = match[1].trim();
    }
    if (!finalTitle) finalTitle = '未命名论文';

    let prompt = `你是一位学术论文写作专家，现在用户提供了一份论文大纲的Markdown文本，请你将其转换为结构化的JSON格式。\n`;
    prompt += `用户的论文标题：${finalTitle}\n`;
    prompt += `用户提供的大纲文本如下：\n\`\`\`\n${userText}\n\`\`\`\n\n`;
    prompt += `请严格按照以下JSON结构输出（不要有任何额外文字，只输出JSON）：\n`;
    prompt += `{
  "title": "论文标题",
  "chapters": [
    {
      "level": 1,
      "title": "第一章 绪论",
      "desc": "本章概述...（根据章节内容生成简要描述）",
      "children": [
        {
          "level": 2,
          "title": "一、研究背景",   // ★★★ 二级标题用中文数字 + 顿号 ★★★
          "desc": "描述...",
          "children": [
            {
              "level": 3,
              "title": "1 背景子点",   // ★★★ 三级标题用数字 + 空格，整章连续编号 ★★★
              "desc": "详细描述...",
              "features": []
            },
            {
              "level": 3,
              "title": "2 另一个子点",
              "desc": "...",
              "features": []
            }
          ]
        },
        {
          "level": 2,
          "title": "二、文献综述",   // ★★★ 第二个二级标题为“二、” ★★★
          "desc": "...",
          "children": [
            {
              "level": 3,
              "title": "3 继续编号",   // ★★★ 三级标题继续递增，不因二级重置 ★★★
              "desc": "...",
              "features": []
            }
          ]
        }
      ]
    }
  ]
}\n`;
    prompt += `要求：\n`;
    prompt += `- 每个节点必须包含 level、title、desc、children（数组）、features（数组）。\n`;
    prompt += `- 一级标题对应 level=1，二级 level=2，三级 level=3。\n`;
    prompt += `- 请根据文本的标题层级（#、##、###）正确设置level。\n`;
    prompt += `- 如果某小节没有描述，请根据标题内容生成一句简短的描述（desc）。\n`;
    prompt += `- 如果小节内容可能包含数据表或图表，可以在features中添加"table"或"chart"等标签（可选）。\n`;
    prompt += `- ★★★ 大纲必须从“第一章 绪论”开始，不要包含“摘要”、“关键词”、“参考文献”等独立章节。★★★\n`;
    prompt += `- ★★★ 每章内部的二级标题必须使用“一、”、“二、”、“三、”……顺序编号，不可重复。★★★\n`;
    prompt += `- ★★★ 每章内部的三级标题必须使用“1”、“2”、“3”……顺序编号，且在整个章内连续，不因二级标题而重置（例如第一章所有三级标题依次为1,2,3,4...）。★★★\n`;
    prompt += `- 确保JSON完整闭合，不要遗漏任何括号或逗号。\n`;
    prompt += `- 只输出JSON，不要输出任何解释文字。`;

    return prompt;
}


// ---------- POST /api/generate ----------
router.post('/generate', async (req, res) => {
    console.log(343, '收到生成全文 /generate', new Date().Format("yyyy-MM-dd hh:mm:ss"),JSON.stringify(req.body));
    const config = await loadConfig();
    if (!config) {
        return res.status(400).json({ error: '请先配置 API Key 和模型（点击右上角齿轮设置）' });
    }
    const { title, degree = 'undergraduate', extraPrompt = '', userId, outline, feedContent, totalWords } = req.body;
    if (!title) {
        return res.status(400).json({ error: '标题不能为空' });
    }

    const taskId = uuidv4();
    const newTask = {
        id: taskId,
        title,
        degree,
        extraPrompt: extraPrompt || null,
        userId: userId || 'anonymous',
        status: 'pending',
        files: {},
        createdAt: new Date().toISOString(),
        error: null,
        outline: outline || null,
        feedContent: feedContent || null,
        totalWords: totalWords || null,
    };

    const tasks = await readTasks();
    tasks.push(newTask);
    await writeTasks(tasks);

    // 异步执行生成
    (async () => {
        try {
            // 更新状态为 generating
            let tasks = await readTasks();
            let task = tasks.find(t => t.id === taskId);
            if (task) task.status = 'generating';
            await writeTasks(tasks);
            console.log(381, "等待写入文件完成")
            let files;
            if (outline && outline.chapters && outline.chapters.length > 0) {
                const totalWordsNum = totalWords ? parseInt(totalWords) : 30000;
                const feedText = feedContent || '';
                files = await generateFullThesisWithOutline(
                    taskId,
                    title,
                    degree,
                    extraPrompt,
                    outline,
                    feedText,
                    totalWordsNum
                );
            } else {
                files = await generateFullThesis(taskId, title, degree, extraPrompt);
            }

            tasks = await readTasks();
            task = tasks.find(t => t.id === taskId);
            if (task) {
                task.status = 'done';
                task.files = files;
                task.completedAt = new Date().Format("yyyy-MM-dd hh:mm:ss");
                await writeTasks(tasks);
            }
        } catch (err) {
            console.error('生成失败:', err);
            const tasks = await readTasks();
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                task.status = 'error';
                task.error = err.message || '生成失败';
                await writeTasks(tasks);
            }
        }
    })();

    res.json({ taskId, status: 'pending' });
});

module.exports = router;