// simple_workflow.js
// 一个极简的论文生成演示：给定题目 → 生成大纲 → 逐章生成 → 合成全文 → 保存为MD

const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');

Date.prototype.Format = function(fmt) {
    const o = {
        "M+": this.getMonth() + 1,
        "d+": this.getDate(),
        "h+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "q+": Math.floor((this.getMonth() + 3) / 3),
        "S": this.getMilliseconds()
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (let k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
};


// ========== 工具函数（从 common/helpers.js 和 common/utils.js 复制） ==========
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Date.prototype.Format = function (fmt) {
    const o = {
        "M+": this.getMonth() + 1,
        "d+": this.getDate(),
        "h+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "q+": Math.floor((this.getMonth() + 3) / 3),
        "S": this.getMilliseconds()
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (let k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
};

// 修复 JSON（去除末尾逗号、属性名加引号）
function repairJSON(str) {
    str = str.replace(/,\s*([}\]])/g, '$1');
    str = str.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
    return str;
}

// 将章节树转为 Markdown 大纲文本（用于提示词）
function buildOutlineString(chapter) {
    let str = `# ${chapter.title}\n`;
    if (chapter.desc) str += `描述：${chapter.desc}\n`;
    if (chapter.children) {
        chapter.children.forEach(child => {
            str += `## ${child.title}\n`;
            if (child.desc) str += `描述：${child.desc}\n`;
            if (child.children) {
                child.children.forEach(grand => {
                    str += `### ${grand.title}\n`;
                    if (grand.desc) str += `描述：${grand.desc}\n`;
                });
            }
        });
    }
    return str;
}

// ========== 加载 API Key（用户指定的双模式） ==========
async function loadEnv() {
    dotenv.config(); // 默认加载当前目录 .env
    let apiKey = process.env.ZHIPUAI_API_KEY;
    console.log(77, '[loadEnv] 默认读取 ZHIPUAI_API_KEY:', apiKey ? '已存在' : '未找到',new Date().Format("yyyy-MM-dd hh:mm:ss"));

    if (!apiKey || apiKey.trim() === '') {
        console.log(80, '[loadEnv] 尝试从备用路径读取 .env ...',new Date().Format("yyyy-MM-dd hh:mm:ss"));
        const specifiedPath = path.resolve('C:/node/local_lunwen_ai/hermes/skills/nodeproject/.env');
        try {
            const content = await fs.readFile(specifiedPath, 'utf-8');
            const parsed = dotenv.parse(content);
            if (parsed.ZHIPUAI_API_KEY && parsed.ZHIPUAI_API_KEY.trim() !== '') {
                apiKey = parsed.ZHIPUAI_API_KEY;
                process.env.ZHIPUAI_API_KEY = apiKey;
                console.log(88, '[loadEnv] 从备用路径成功读取 Key',new Date().Format("yyyy-MM-dd hh:mm:ss"));
            }
        } catch (err) {
            console.error('[loadEnv] 读取备用 .env 失败:', err.message);
        }
    }

    return apiKey || null;
}

// ========== 调用智谱 AI（简化版） ==========
async function callAI(prompt, apiKey) {
    const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    try {
        const response = await axios.post(
            API_URL,
            {
                model: 'GLM-4-Flash',
                max_tokens: 18096,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 1200000, // 20分钟
            }
        );
        const content = response.data.choices[0].message.content;
        if (!content || content.trim() === '') throw new Error('API 返回空内容');
        return content;
    } catch (err) {
        console.error('[callAI] 请求失败:', err.message,new Date().Format("yyyy-MM-dd hh:mm:ss"));
        if (err.response) {
            console.error('状态码:', err.response.status,new Date().Format("yyyy-MM-dd hh:mm:ss"));
            console.error('错误详情:', JSON.stringify(err.response.data, null, 2));
        }
        throw err;
    }
}

// ========== 主流程 ==========
async function main() {
    console.log(133, '========================================');
    console.log(134, '  📄 简单论文生成工作流 (本科 8000字)');
    console.log(135, '========================================\n');

    // 1. 加载 API Key
    const API_KEY = await loadEnv();
    if (!API_KEY) {
        console.error('❌ 未找到 ZHIPUAI_API_KEY，请检查 .env 文件');
        return;
    }
    console.log(143, '✅ API Key 加载成功\n',new Date().Format("yyyy-MM-dd hh:mm:ss"));

    // 2. 硬编码论文信息
    const TITLE = '中小企业融资难的原因及对策研究';
    const DEGREE = '本科';
    const TOTAL_WORDS = 8000;
    const OUTPUT_DIR = path.join(__dirname, 'output');
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    console.log(152, `📌 论文标题: ${TITLE}`,new Date().Format("yyyy-MM-dd hh:mm:ss"));
    console.log(153, `🎓 学位: ${DEGREE}`,new Date().Format("yyyy-MM-dd hh:mm:ss"));
    console.log(154, `📏 目标字数: ${TOTAL_WORDS} 字\n`,new Date().Format("yyyy-MM-dd hh:mm:ss"));

    // 3. 生成大纲
    console.log(157, '🔄 步骤 1/4: 生成论文大纲 ...',new Date().Format("yyyy-MM-dd hh:mm:ss"));
    const outlinePrompt = buildOutlinePrompt(TITLE, DEGREE, TOTAL_WORDS);
    let outlineJson;
    try {
        const outlineText = await callAI(outlinePrompt, API_KEY);
        // 提取 JSON
        const match = outlineText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('未找到有效的 JSON');
        let jsonStr = repairJSON(match[0]);
        outlineJson = JSON.parse(jsonStr);
        console.log(167, '✅ 大纲生成成功，包含章节数:', outlineJson.chapters.length,new Date().Format("yyyy-MM-dd hh:mm:ss"));
        // 打印章节标题
        outlineJson.chapters.forEach((ch, i) => {
            console.log(170, `   ${i+1}. ${ch.title}`,new Date().Format("yyyy-MM-dd hh:mm:ss"));
        });
    } catch (err) {
        console.error('❌ 大纲生成失败:', err.message);
        return;
    }

    // 4. 逐章生成正文
    console.log(178, '\n🔄 步骤 2/4: 逐章生成正文 ...');
    const chapters = outlineJson.chapters;
    // 识别短章节（绪论、引言、结论、结语）
    const shortKeywords = /绪论|引言|结论|结语/;
    let normalCount = 0, shortCount = 0;
    chapters.forEach(ch => {
        if (shortKeywords.test(ch.title)) shortCount++;
        else normalCount++;
    });
    const totalCoeff = normalCount + shortCount * 0.6;
    const baseTarget = Math.floor(TOTAL_WORDS / totalCoeff);

    let thesisBody = '';
    let allPreviousContent = ''; // 可提供给后续章节作为上下文（简单传递）

    for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        const isShort = shortKeywords.test(chapter.title);
        let targetWords = isShort ? Math.floor(baseTarget * 0.6) : baseTarget;
        if (targetWords < 500) targetWords = 500;

        console.log(199, `   📝 生成章节 ${i+1}/${chapters.length}: "${chapter.title}" (目标 ${targetWords} 字)`,new Date().Format("yyyy-MM-dd hh:mm:ss"));

        // 构建该章的大纲结构（含二级、三级标题）
        const outlineStr = buildOutlineString(chapter);

        // 构建提示词（从 engine.js 的 buildChapterPrompt 简化）
        let prompt = `请撰写论文《${TITLE}》的“${chapter.title}”章节（${DEGREE}论文）。\n`;
        if (chapter.desc) prompt += `本章核心内容：${chapter.desc}\n`;
        prompt += `\n**本章必须严格按照以下大纲结构撰写，包含所有一级、二级、三级标题。**\n`;
        prompt += `大纲结构：\n${outlineStr}\n\n`;
        prompt += `要求字数：${Math.floor(targetWords*1.1)} 至 ${Math.floor(targetWords*1.3)} 字。\n`;
        prompt += `内容需学术严谨，逻辑清晰，引用真实文献。\n`;
        if (allPreviousContent) {
            prompt += `\n### 前面已生成的章节内容（保持连贯）：\n${allPreviousContent}\n`;
        }
        prompt += `\n**输出格式要求**：\n`;
        prompt += `- 直接以一级标题 "# ${chapter.title}" 开头，然后换行写正文。\n`;
        prompt += `- 内部小节（二级、三级）必须使用相应的Markdown标题（##、###），保持与上述大纲结构完全一致。\n`;
        prompt += `- 正文段落中不要使用数字序号列表（1. 2. 3.）来组织内容。\n`;
        prompt += `- 在本章内容结束后，必须另起一行，输入“---”（分隔线），然后换行输入“**参考文献**”，再换行列出至少3~5条本章引用的参考文献（GB/T 7714格式）。\n`;

        let content;
        try {
            content = await callAI(prompt, API_KEY);
        } catch (err) {
            console.error(`❌ 章节 "${chapter.title}" 生成失败:`, err.message,new Date().Format("yyyy-MM-dd hh:mm:ss"));
            return;
        }

        // 确保内容以一级标题开头
        const lines = content.split('\n');
        let hasTitle = false;
        for (let j = 0; j < Math.min(lines.length, 10); j++) {
            if (lines[j].trim().startsWith('# ')) {
                hasTitle = true;
                break;
            }
        }
        if (!hasTitle) {
            content = `# ${chapter.title}\n\n${content}`;
        }

        thesisBody += `\n${content}\n`;
        allPreviousContent += `\n${content}\n`; // 累积上下文

        console.log(244, `   ✅ 章节 "${chapter.title}" 完成，等待 5 秒...`,new Date().Format("yyyy-MM-dd hh:mm:ss"));
        await sleep(5000); // 避免请求过快
    }

    // 5. 生成摘要和参考文献
    console.log(249, '\n🔄 步骤 3/4: 生成摘要和参考文献 ...',new Date().Format("yyyy-MM-dd hh:mm:ss"));
    const fullText = `# ${TITLE}\n\n${thesisBody}`;

    // 摘要
    const abstractPrompt = `
为论文"${TITLE}"撰写摘要内容，包括中文摘要和英文摘要（Abstract）。
以下是论文正文全文：
${fullText}
请基于此撰写摘要。
中文摘要约300字，英文摘要约200词，概括研究背景、方法、结果和结论。
**输出格式**：首先输出中文摘要正文（不要加“中文摘要”标题），空一行，接着输出英文摘要正文（不要加“Abstract”标题）。
只输出正文内容，不要包含任何标题或标签。
`;
    let abstractText;
    try {
        abstractText = await callAI(abstractPrompt, API_KEY);
    } catch (err) {
        console.error('❌ 摘要生成失败:', err.message,new Date().Format("yyyy-MM-dd hh:mm:ss"));
        return;
    }
    const parts = abstractText.split(/\n\s*\n/);
    let chineseAbstract = parts[0] || '（中文摘要内容）';
    let englishAbstract = parts[1] || '（English abstract content）';
    chineseAbstract = chineseAbstract.replace(/^中文摘要[:：]\s*/i, '');
    englishAbstract = englishAbstract.replace(/^Abstract[:：]\s*/i, '');

    // 参考文献
    const refPrompt = `
根据以下论文正文内容，生成符合GB/T 7714格式的参考文献列表，至少15篇。
**重要要求**：参考文献必须真实、可查，不可凭空编造。
论文正文：
${fullText}
只输出参考文献列表，不要加标题。
`;
    let references;
    try {
        references = await callAI(refPrompt, API_KEY);
    } catch (err) {
        console.error('❌ 参考文献生成失败:', err.message,new Date().Format("yyyy-MM-dd hh:mm:ss"));
        return;
    }

    // 6. 合成完整论文
    console.log(292, '\n🔄 步骤 4/4: 合成并保存完整论文 ...',new Date().Format("yyyy-MM-dd hh:mm:ss"));
    const fullPaper = `# ${TITLE}\n\n# 摘要\n\n${chineseAbstract}\n\n# Abstract\n\n${englishAbstract}\n\n${thesisBody}\n\n# 参考文献\n\n${references}\n`;

    const filename = `${TITLE.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_')}_论文.md`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, fullPaper, 'utf-8');

    console.log(299, `\n🎉 论文生成完成！`,new Date().Format("yyyy-MM-dd hh:mm:ss"));
    console.log(300, `📁 文件保存位置: ${filepath}`);
    console.log(301, `📊 总字数: ${fullPaper.length} 字符（含标题和标记）`);
    console.log(302, '========================================\n');
}

// ========== 生成大纲的提示词 ==========
function buildOutlinePrompt(title, degree, totalWords) {
    const chapterCount = 6; // 本科通常 6 章
    return `
你是一位学术论文写作专家，请为论文《${title}》生成一份详细的大纲（${degree}论文）。
论文总字数约 ${totalWords} 字，需包含 ${chapterCount} 章（含绪论和结论）。
输出格式必须是合法的JSON，结构如下：
{
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
    }
  ]
}
要求：
- 每个章节必须包含 title 和 desc。
- level 取值 1、2、3，一级对应章，二级为“一、XXX”，三级为“1 XXX”。
- 绪论章应包含研究背景、文献综述、研究方法等；结论章总结成果。
- 主体部分（2~4章）应包含现状分析、问题剖析、解决方案等。
- 请根据学科特点合理分配内容，确保逻辑连贯。
- 只输出JSON，不要有任何额外文字。
`;
}

// ========== 启动 ==========
main().catch(err => {
    console.error('程序执行出错:', err);
});