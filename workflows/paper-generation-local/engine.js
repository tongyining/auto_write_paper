// workflows/paper-generation/engine.js
const path = require('path');
const fs = require('fs').promises;
const { callGLM } = require('./glmClient');
const { sleep } = require('./helpers');
const { DEGREE_CONFIG } = require('./config_lunwen');
const {
    repairJSON,
    extractChaptersFromOutline,
    buildChapterPrompt,
    flattenChapters,
    stripLeadingTitle
} = require('./utils');
const { convertMdToDocx } = require('../../md2docx_custom_node_server');
// +++ 新增：引入远程日志发送函数 +++

const OUTPUT_DIR = path.join(__dirname, '../../output');

// ---------- 内部辅助：生成并保存，同时存入 context ----------
async function generateAndSave(stepKey, promptBuilder, context, taskId, extra, feedContent, isPostgraduate, degreeName, logConversation) {
    const prompt = promptBuilder(context);
    const now = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(23, `[${now}] [${stepKey}] 提示词字符数: ${prompt.length}`);
    await logConversation(`${stepKey}_request`, prompt, '', `请求前，提示词长度=${prompt.length}`);

    let content;
    try {
        content = await callGLM(prompt);
    } catch (err) {
        const nowErr = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.error(`[${nowErr}] [${stepKey}] 调用 GLM 失败:`, err.message);
        await logConversation(`${stepKey}_error`, prompt, '', `错误: ${err.message}`);
        throw err;
    }
    const nowResp = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(36, `[${nowResp}] [${stepKey}] 响应长度: ${content.length} 字符`);
    await logConversation(`${stepKey}_response`, prompt, content, `响应长度=${content.length}`);

    const filename = `${taskId}_${stepKey}.md`;
    const filePath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filePath, content, 'utf-8');
    context[stepKey] = content;

    // 转 DOCX
    try {
        const docxPath = filePath.replace(/\.md$/, '.docx');
        await convertMdToDocx(filePath, docxPath);
        const nowDocx = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(49, `[${nowDocx}] ✅ ${stepKey} DOCX 已生成: ${docxPath}`);

    } catch (err) {
        console.error(`⚠️ 转换 ${stepKey} 为 DOCX 失败:`, err.message);
    }
    await sleep(20000);
    return filename;
}

// ---------- 自动生成全文（无用户大纲） ----------
async function generateFullThesis(taskId, title, degree, extraPrompt) {
    const config = DEGREE_CONFIG[degree] || DEGREE_CONFIG.undergraduate;
    const nowStart = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(62, `[${nowStart}] [generateFullThesis] 学位=${degree}, 配置=`, config);
    const isPostgraduate = config.isPostgraduate;
    const degreeName = config.degreeName;
    const extra = extraPrompt ? `\n额外要求：${extraPrompt}` : '';

    const context = {};
    const logFile = path.join(OUTPUT_DIR, `${taskId}_conversation.log`);
    let logLineCounter = 0;
    async function logConversation(step, prompt, response, extraInfo = '') {
        logLineCounter++;
        const timestamp = new Date().toISOString();
        const entry = `
========== [${logLineCounter}] ${step} ==========
[时间] ${timestamp}
[提示词长度] ${prompt ? prompt.length : 0} 字符
[回复长度] ${response ? response.length : 0} 字符
${extraInfo ? `[额外信息] ${extraInfo}\n` : ''}
[提示词内容]
${prompt || ''}
[回复内容]
${response || ''}
====================================================
`;
        await fs.appendFile(logFile, entry, 'utf-8').catch(() => {});
    }

    // ---- 步骤1：领域分析 ----
    await generateAndSave('01_领域分析', (ctx) => {
        return `请对论文题目"${title}"进行深入的领域分析。
1. 明确该论文所属的学科领域和研究方向。
2. 分析该领域的前沿分支，列举主要分支方向。
3. 针对每个分支，指出哪些国家、哪些研究团队在主导，有哪些代表性研究成果。
4. 总结当前领域的研究难点和主要分歧点。
**写作要求**：语言流畅自然，逻辑清晰，采用学术论文的分析性语言。
**格式要求**：使用Markdown，一级标题用#，二级标题用##，三级用###，列表用-或数字。
${extra}`;
    }, context, taskId, extra, '', isPostgraduate, degreeName, logConversation);

    // ---- 步骤2：文献综述 ----
    await generateAndSave('02_文献综述', (ctx) => {
        const domain = ctx['01_领域分析'] || '';
        return `基于以下领域分析报告（主题为"${title}"），撰写一份文献综述。
领域分析内容：
${domain}
**写作要求（严格遵循）**：
1. 按国内外分别梳理，先写国外研究现状，再写国内研究现状。
2. 每个研究现状下分至少两个观点，每个观点写三段话，每段话必须包含一句主题句，然后紧跟文献综述内容，形式：主题句，作者（年份）+主要内容。每段可包含多个作者，上下段作者尽量不重复。
3. 综述应包含具体的研究成果和对应的参考文献（至少${isPostgraduate ? '25' : '15'}篇），文献格式符合GB/T 7714。
4. 最后撰写文献述评：归纳上述观点（不写作者），指出研究局限性（一句话），并说明本文拟应用的点（一句话）。
**格式要求**：综述用#作为一级标题（如“# 文献综述”），内部小节用##，列表用-。
${extra}`;
    }, context, taskId, extra, '', isPostgraduate, degreeName, logConversation);

    // ---- 步骤3：标题研究 ----
    await generateAndSave('03_标题研究', (ctx) => {
        const domain = ctx['01_领域分析'] || '';
        const lit = ctx['02_文献综述'] || '';
        return `基于以下领域分析和文献综述，对论文标题"${title}"进行深入研究。
领域分析：
${domain}
文献综述：
${lit}
要求：
1. 明确标题所聚焦的具体问题。
2. 分析该问题的研究现状、已有解决方案的不足。
3. 提出本文拟解决的关键问题和研究目标。
4. 简要说明研究的创新点和可能贡献。
**要求**：论述有层次，逻辑紧密，体现批判性思维。
**格式**：使用#作为一级标题（如“# 标题研究”），内部用##。
${extra}`;
    }, context, taskId, extra, '', isPostgraduate, degreeName, logConversation);

    // ---- 步骤4：开题报告 ----
    await generateAndSave('04_开题报告', (ctx) => {
        const domain = ctx['01_领域分析'] || '';
        const lit = ctx['02_文献综述'] || '';
        const titleResearch = ctx['03_标题研究'] || '';
        return `基于以下内容撰写一份${degreeName}开题报告。
领域分析：
${domain}
文献综述：
${lit}
标题研究：
${titleResearch}
开题报告需包含：题目、研究背景与意义、国内外研究现状（可引用文献）、研究内容与方法、进度安排、预期成果。
字数不少于 ${isPostgraduate ? '1500' : '1000'} 字。
**写作要求**：结构规范，语言正式，逻辑清晰。
**格式**：使用#作为各部分一级标题（如“# 研究背景与意义”），内部用##。
${extra}`;
    }, context, taskId, extra, '', isPostgraduate, degreeName, logConversation);

    // ---- 步骤5：论文大纲 ----
    await generateAndSave('05_论文大纲', (ctx) => {
        const domain = ctx['01_领域分析'] || '';
        const lit = ctx['02_文献综述'] || '';
        const titleResearch = ctx['03_标题研究'] || '';
        const proposal = ctx['04_开题报告'] || '';
        const totalChapters = config.chapters;
        return `基于以下内容为论文"${title}"生成一份详细的章节大纲。
领域分析：
${domain}
文献综述：
${lit}
标题研究：
${titleResearch}
开题报告：
${proposal}
**论文整体结构必须遵循通用框架**：
1. 绪论（研究背景与意义、文献综述、研究方法与论文框架）
2. 理论基础/相关概念（如适用）
3. 现状分析（对研究对象当前状态的系统描述）
4. 问题剖析（提炼现有研究或实践中的不足、矛盾或空白）
5. 解决方案/创新性构建（提出改进框架、模型或策略）
6. 结论（总结成果、局限与未来展望）
**章节数量**：总章数控制在 ${totalChapters} 章左右（含绪论和结论），主体部分（除绪论和结论外）通常 ${totalChapters - 2} 章。
**标题格式要求**：
- 章标题（如“第一章 绪论”）使用一级标题（#）
- 章内小节标题使用二级标题（##），如“## 1、研究背景”
- 子点使用三级标题（###），如“### 1.1 具体问题”
**输出要求**：只输出大纲，不展开内容，使用Markdown标题结构。
${extra}`;
    }, context, taskId, extra, '', isPostgraduate, degreeName, logConversation);

    // ---- 步骤6：正式论文（分章节生成） ----
    const outlineContent = await fs.readFile(path.join(OUTPUT_DIR, `${taskId}_05_论文大纲.md`), 'utf-8');
    let chapters = extractChaptersFromOutline(outlineContent);
    if (chapters.length < 3) {
        chapters = ['绪论', '理论基础', '现状分析', '问题剖析', '解决方案', '结论'];
    }
    const nowChapters = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(192, `[${nowChapters}] 自动生成模式，章节列表:`, chapters);

    // 自动生成时没有 totalWords，使用配置的 wordsPerChapter 作为基础
    const wordsPerChapter = config.wordsPerChapter;
    // 但依然应用短章节系数：需要动态识别
    const shortKeywords = /绪论|引言|结论|结语/;
    let normalCount = 0, shortCount = 0;
    chapters.forEach(ch => {
        if (shortKeywords.test(ch)) {
            shortCount++;
        } else {
            normalCount++;
        }
    });
    const totalCoeff = normalCount + shortCount * 0.6;
    // 基础目标字数（普通章节）
    const baseTarget = Math.floor(wordsPerChapter * 1.2); // 让字数多一点
    // 但为了更合理，我们以 wordsPerChapter 作为普通章节目标，短章节乘以0.6
    // 这里我们不使用 baseTarget，而是直接计算每个章节的 targetWords

    const allPreviousContent = `
${context['01_领域分析'] || ''}
${context['02_文献综述'] || ''}
${context['03_标题研究'] || ''}
${context['04_开题报告'] || ''}
${outlineContent}
`;
    await logConversation('allPreviousContent', '', '', `allPreviousContent 长度=${allPreviousContent.length} 字符`);

    let thesisBody = '';
    const chapterNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const chapterNumber = chapterNumbers[i] || (i + 1);
        const expectedTitle = `第${chapterNumber}章 ${ch}`;

        const isShort = shortKeywords.test(ch);
        let targetWords;
        if (isShort) {
            targetWords = Math.floor(wordsPerChapter * 0.6);
        } else {
            targetWords = wordsPerChapter;
        }
        if (targetWords < 500) targetWords = 500;

        const nowChapter = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(239, `[${nowChapter}] 生成章节 ${expectedTitle}，目标字数基础: ${targetWords}`);

        const isIntroOrConclusion = isShort;
        const minW = Math.floor(targetWords * 0.8);
        const maxW = Math.floor(targetWords * 1.2);

        let chapterPrompt = `请撰写论文"${title}"的"${ch}"章节的正文内容（${degreeName}论文）。\n\n`;
        chapterPrompt += `### 整体背景（包含领域分析、文献综述、标题研究、开题报告、大纲）：\n${allPreviousContent}\n\n`;
        chapterPrompt += `- **在本章末尾必须列出参考文献，参考文献需真实准确可追溯，采用以下Markdown格式：\n`;
        chapterPrompt += `  在章节内容结束后，另起一行，输入“---”（分隔线），然后换行输入“**参考文献**”，再换行按顺序列出参考文献条目，格式为GB/T 7714（如[1] 作者. 题名[J]. 刊名, 年, 卷(期): 页码.）。确保每条文献真实可查。**\n`;
        if (thesisBody) {
            chapterPrompt += `### 前面已生成的章节内容（保持连贯）：\n${thesisBody}\n\n`;
        }
        chapterPrompt += `### 当前章节要求：\n`;
        chapterPrompt += `- 内容充实，逻辑连贯，字数约${minW}~${maxW}字。\n`;
        chapterPrompt += `- 深度符合${degreeName}论文要求。\n`;
        chapterPrompt += `- 可包含必要的公式、图表描述或代码片段（如适用）。\n`;
        chapterPrompt += `- 引用相关文献（可参考前面已经搜集分析过的文献，但需格式规范）。\n`;
        chapterPrompt += `- **内部小节必须使用Markdown二级标题（##）加中文序号，例如“## 一、政策背景”**，不要使用无标记的文本。\n`;
        chapterPrompt += `- **更细的子点使用三级标题（###）加数字序号，例如“### 1. 具体措施”**。\n`;
        chapterPrompt += `- **请直接输出该章的一级标题，格式为 "# ${expectedTitle}"，然后换行输出正文内容。**\n`;
        chapterPrompt += `- **不要输出其他额外的一级标题（如“# 现状分析”），只需输出本章节的一级标题。**\n`;
        chapterPrompt += `- **正文段落中请勿使用数字序号列表（1. 2. 3.）来组织内容，请使用二级标题和三级标题划分小节。**\n`;
        chapterPrompt += `章节内部小节编号必须从“一”开始，按顺序递增，不得跳跃或遗漏。例如第一个二级标题应为“## 一、...”，第二个为“## 二、...”，依此类推。\n`;
        chapterPrompt += `- 语言自然流畅，避免生硬罗列，使用逻辑连接词。\n`;
        if (/问题|剖析/.test(ch)) {
            chapterPrompt += `- **问题分析要求**：问题必须从现状中推导，需提出至少${isPostgraduate ? '4' : '3'}个具体问题点，每个问题点需有数据或事实支撑。\n`;
        }
        if (/对策|建议|措施|策略/.test(ch)) {
            chapterPrompt += `- **对策要求**：对策必须与前文问题一一对应，每条对策需包含执行主体、具体动作（含频率）、量化目标，禁止使用“加强”、“完善”、“提高”等空泛词汇。\n`;
        }
        chapterPrompt += extra;

        const nowPrompt = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(273, `[${nowPrompt}] [生成章节 ${expectedTitle}] 提示词字符数: ${chapterPrompt.length}`);
        await logConversation(`06_${expectedTitle}_request`, chapterPrompt, '',
            `章节索引=${i+1}, 提示词长度=${chapterPrompt.length}, thesisBody长度=${thesisBody.length}`);

        let content;
        try {
            content = await callGLM(chapterPrompt);
        } catch (err) {
            await logConversation(`06_${expectedTitle}_error`, chapterPrompt, '', `错误: ${err.message}`);
            throw err;
        }

        await logConversation(`06_${expectedTitle}_response`, chapterPrompt, content,
            `响应长度=${content.length}`);

        const lines = content.split('\n');
        let hasTitle = false;
        for (let j = 0; j < Math.min(lines.length, 10); j++) {
            if (lines[j].trim().startsWith('# ')) {
                hasTitle = true;
                break;
            }
        }
        if (hasTitle) {
            thesisBody += `\n${content}\n`;
        } else {
            thesisBody += `\n# ${expectedTitle}\n\n${content}\n`;
        }
        const nowDone = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(302, `[${nowDone}] ⏳ 章节 ${expectedTitle} 生成完成，等待 20 秒后继续...`);
        await sleep(20000);
        await logConversation(`thesisBody_after_${i+1}`, '', '', `累积 thesisBody 长度=${thesisBody.length} 字符`);
    }

    // ---- 步骤7：摘要 ----
    const fullThesisText = `# ${title}\n\n${thesisBody}`;
    const abstractPrompt = `
为论文"${title}"撰写摘要内容，包括中文摘要和英文摘要（Abstract）。
以下是论文正文全文：
${fullThesisText}
请基于此撰写摘要。
中文摘要约${isPostgraduate ? '400' : '300'}字，英文摘要约${isPostgraduate ? '250' : '200'}词，概括研究背景、方法、结果和结论。
**输出格式**：首先输出中文摘要正文（不要加“中文摘要”标题），空一行，接着输出英文摘要正文（不要加“Abstract”标题）。
只输出正文内容，不要包含任何标题或标签。
${extra}
`;
    const nowAbstract = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(320, `[${nowAbstract}] 开始生成摘要...`);
    const abstractText = await callGLM(abstractPrompt);
    await logConversation('07_摘要', abstractPrompt, abstractText);
    const parts = abstractText.split(/\n\s*\n/);
    let chineseAbstract = parts[0] || '（中文摘要内容）';
    let englishAbstract = parts[1] || '（English abstract content）';
    chineseAbstract = chineseAbstract.replace(/^中文摘要[:：]\s*/i, '');
    englishAbstract = englishAbstract.replace(/^Abstract[:：]\s*/i, '');

    // ---- 步骤8：参考文献 ----
    const refPrompt = `
根据以下论文正文内容，生成符合GB/T 7714格式的参考文献列表，至少${isPostgraduate ? '25' : '15'}篇。
论文正文：
${fullThesisText}
只输出参考文献列表，不要加标题。
`;
    const nowRef = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(337, `[${nowRef}] 开始生成参考文献...`);
    const references = await callGLM(refPrompt);
    await logConversation('08_参考文献', refPrompt, references);

    // 最终组装
    const fullPaper = `# ${title}\n\n# 摘要\n\n${chineseAbstract}\n\n# Abstract\n\n${englishAbstract}\n\n${thesisBody}\n\n# 参考文献\n\n${references}\n`;
    const thesisFile = `${taskId}_06_正式论文.md`;
    const thesisMdPath = path.join(OUTPUT_DIR, thesisFile);
    await fs.writeFile(thesisMdPath, fullPaper, 'utf-8');
    const nowSave = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(347, `[${nowSave}] ✅ 正式论文 MD 已保存: ${thesisMdPath}`);

    try {
        const thesisDocxPath = thesisMdPath.replace(/\.md$/, '.docx');
        await convertMdToDocx(thesisMdPath, thesisDocxPath);
        const nowDocx = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(353, `[${nowDocx}] ✅ 正式论文 DOCX 已生成: ${thesisDocxPath}`);

    } catch (err) {
        console.error(`⚠️ 转换正式论文为 DOCX 失败:`, err.message);
    }

    return {
        domain: `${taskId}_01_领域分析.md`,
        literature: `${taskId}_02_文献综述.md`,
        titleResearch: `${taskId}_03_标题研究.md`,
        proposal: `${taskId}_04_开题报告.md`,
        outline: `${taskId}_05_论文大纲.md`,
        thesis: thesisFile,
    };
}

// ---------- 基于用户自定义大纲生成全文（主要修改点） ----------
async function generateFullThesisWithOutline(taskId, title, degree, extraPrompt, outline, feedContent, totalWords) {
    const config = DEGREE_CONFIG[degree] || DEGREE_CONFIG.undergraduate;
    const nowStart = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(373, `[${nowStart}] [generateFullThesisWithOutline] 学位=${degree}, 总字数=${totalWords}, 配置=`, config);
    const isPostgraduate = config.isPostgraduate;
    const degreeName = config.degreeName;
    const extra = extraPrompt ? `\n额外要求：${extraPrompt}` : '';

    // 日志和上下文
    const context = {};
    const logFile = path.join(OUTPUT_DIR, `${taskId}_conversation.log`);
    let logLineCounter = 0;
    async function logConversation(step, prompt, response, extraInfo = '') {
        logLineCounter++;
        const timestamp = new Date().toISOString();
        const entry = `
========== [${logLineCounter}] ${step} ==========
[时间] ${timestamp}
[提示词长度] ${prompt ? prompt.length : 0} 字符
[回复长度] ${response ? response.length : 0} 字符
${extraInfo ? `[额外信息] ${extraInfo}\n` : ''}
[提示词内容]
${prompt || ''}
[回复内容]
${response || ''}
====================================================
`;
        await fs.appendFile(logFile, entry, 'utf-8').catch(() => {});
    }

    async function generateAndSaveWithCtx(stepKey, promptBuilder) {
        const prompt = promptBuilder(context);
        const nowReq = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(403, `[${nowReq}] [${stepKey}] 提示词字符数: ${prompt.length}`);
        await logConversation(`${stepKey}_request`, prompt, '', `请求前，提示词长度=${prompt.length}`);
        let content;
        try {
            content = await callGLM(prompt);
        } catch (err) {
            const nowErr = new Date().Format("yyyy-MM-dd hh:mm:ss");
            console.error(`[${nowErr}] [${stepKey}] 调用 GLM 失败:`, err.message);
            await logConversation(`${stepKey}_error`, prompt, '', `错误: ${err.message}`);
            throw err;
        }
        const nowResp = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(415, `[${nowResp}] [${stepKey}] 响应长度: ${content.length} 字符`);
        await logConversation(`${stepKey}_response`, prompt, content, `响应长度=${content.length}`);
        const filename = `${taskId}_${stepKey}.md`;
        const filePath = path.join(OUTPUT_DIR, filename);
        await fs.writeFile(filePath, content, 'utf-8');
        context[stepKey] = content;
        try {
            const docxPath = filePath.replace(/\.md$/, '.docx');
            await convertMdToDocx(filePath, docxPath);
            const nowDocx = new Date().Format("yyyy-MM-dd hh:mm:ss");
            console.log(425, `[${nowDocx}] ✅ ${stepKey} DOCX 已生成: ${docxPath}`);
        } catch (err) {
            console.error(`⚠️ 转换 ${stepKey} 为 DOCX 失败:`, err.message);
        }
        await sleep(20000);
        return filename;
    }

    // ---- 生成辅助步骤（领域分析、文献综述等） ----
    await generateAndSaveWithCtx('01_领域分析', (ctx) => {
        let p = `请对论文题目"${title}"进行深入的领域分析。\n`;
        p += `1. 明确该论文所属的学科领域和研究方向。\n`;
        p += `2. 分析该领域的前沿分支，列举主要分支方向。\n`;
        p += `3. 针对每个分支，指出哪些国家、哪些研究团队在主导，有哪些代表性研究成果。\n`;
        p += `4. 总结当前领域的研究难点和主要分歧点。\n`;
        p += `**写作要求**：语言流畅自然，逻辑清晰，采用学术论文的分析性语言。\n`;
        p += `**格式要求**：使用Markdown，一级标题用#，二级标题用##，三级用###，列表用-或数字。\n`;
        if (feedContent) p += `\n参考材料：${feedContent}\n`;
        p += extra;
        return p;
    });

    await generateAndSaveWithCtx('02_文献综述', (ctx) => {
        const domain = ctx['01_领域分析'] || '';
        let p = `基于以下领域分析报告（主题为"${title}"），撰写一份文献综述。\n\n`;
        p += `领域分析内容：\n${domain}\n\n`;
        p += `**写作要求（严格遵循）**：\n`;
        p += `1. 按国内外分别梳理，先写国外研究现状，再写国内研究现状。\n`;
        p += `2. 每个研究现状下分至少两个观点，每个观点写三段话，每段话必须包含一句主题句，然后紧跟文献综述内容，形式：主题句，作者（年份）+主要内容。每段可包含多个作者，上下段作者尽量不重复。\n`;
        p += `3. 综述应包含具体的研究成果和对应的参考文献（至少${isPostgraduate ? '25' : '15'}篇），文献格式符合GB/T 7714。\n`;
        p += `4. 最后撰写文献述评：归纳上述观点（不写作者），指出研究局限性（一句话），并说明本文拟应用的点（一句话）。\n`;
        p += `**格式要求**：综述用#作为一级标题（如“# 文献综述”），内部小节用##，列表用-。\n`;
        if (feedContent) p += `\n参考材料：${feedContent}\n`;
        p += extra;
        return p;
    });

    await generateAndSaveWithCtx('03_标题研究', (ctx) => {
        const domain = ctx['01_领域分析'] || '';
        const lit = ctx['02_文献综述'] || '';
        let p = `基于以下领域分析和文献综述，对论文标题"${title}"进行深入研究。\n\n`;
        p += `领域分析：\n${domain}\n\n文献综述：\n${lit}\n\n`;
        p += `要求：\n`;
        p += `1. 明确标题所聚焦的具体问题。\n`;
        p += `2. 分析该问题的研究现状、已有解决方案的不足。\n`;
        p += `3. 提出本文拟解决的关键问题和研究目标。\n`;
        p += `4. 简要说明研究的创新点和可能贡献。\n`;
        p += `**要求**：论述有层次，逻辑紧密，体现批判性思维。\n`;
        p += `**格式**：使用#作为一级标题（如“# 标题研究”），内部用##。\n`;
        if (feedContent) p += `\n参考材料：${feedContent}\n`;
        p += extra;
        return p;
    });

    await generateAndSaveWithCtx('04_开题报告', (ctx) => {
        const domain = ctx['01_领域分析'] || '';
        const lit = ctx['02_文献综述'] || '';
        const titleResearch = ctx['03_标题研究'] || '';
        let p = `基于以下内容撰写一份${degreeName}开题报告。\n\n`;
        p += `领域分析：\n${domain}\n\n文献综述：\n${lit}\n\n标题研究：\n${titleResearch}\n\n`;
        p += `开题报告需包含：题目、研究背景与意义、国内外研究现状（可引用文献）、研究内容与方法、进度安排、预期成果。\n`;
        p += `字数不少于 ${isPostgraduate ? '1500' : '1000'} 字。\n`;
        p += `**写作要求**：结构规范，语言正式，逻辑清晰。\n`;
        p += `**格式**：使用#作为各部分一级标题（如“# 研究背景与意义”），内部用##。\n`;
        if (feedContent) p += `\n参考材料：${feedContent}\n`;
        p += extra;
        return p;
    });

    // ---- 按章生成正文 ----
    const topChapters = outline.chapters;
    const chapterCount = topChapters.length;
    if (chapterCount === 0) {
        throw new Error('大纲中无有效章节，请检查');
    }
    console.log(500, JSON.stringify(topChapters))
    topChapters.forEach((ch, idx) => {
        console.log(502, `章节 一级标题 ${idx+1}: "${ch.title}", features:`, ch.features);
        if (ch.children) {
            ch.children.forEach((child, cidx) => {
                console.log(505, `  [子章节 二级标题] ${cidx+1}: "${child.title}", features:`, child.features);
                if(child.children){
                    child.children.forEach((children, ind) => {
                        console.log(508, `  [三级标题] ${ind+1}: "${children.title}", features:`, children.features);
                    });
                }
            });
        }
    });

    // ---- 动态识别短章节（绪论/引言/结论/结语） ----
    const shortKeywords = /绪论|引言|结论|结语/;
    let normalCount = 0;
    let shortCount = 0;
    topChapters.forEach(ch => {
        if (shortKeywords.test(ch.title)) {
            shortCount++;
        } else {
            normalCount++;
        }
    });
    const totalCoeff = normalCount + shortCount * 0.6;
    const baseTarget = Math.floor(totalWords / totalCoeff);
    const nowCalc = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(529, `[${nowCalc}] 字数分配: 普通章节数=${normalCount}, 短章节数=${shortCount}, 总系数=${totalCoeff}, 基础目标(普通章节)=${baseTarget}字, 短章节目标=${Math.floor(baseTarget*0.6)}字`);
    console.log(530, JSON.stringify(topChapters))
    // 收集辅助内容（供正文提示词使用）
    const allPreviousContent = `
${context['01_领域分析'] || ''}
${context['02_文献综述'] || ''}
${context['03_标题研究'] || ''}
${context['04_开题报告'] || ''}
`;
    await logConversation('allPreviousContent', '', '', `allPreviousContent 长度=${allPreviousContent.length} 字符`);

    let thesisBody = '';

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

    for (let i = 0; i < topChapters.length; i++) {
        const chapter = topChapters[i];
        console.log(562, JSON.stringify(chapter))
        const isShort = shortKeywords.test(chapter.title);
        let targetWords;
        if (isShort) {
            targetWords = Math.floor(baseTarget * 0.6);
        } else {
            targetWords = baseTarget;
        }
        if (targetWords < 500) targetWords = 500;

        const nowChapter = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(573, `[${nowChapter}] 章节 "${chapter.title}" 目标字数基础: ${targetWords}`);

        // 构建大纲结构
        const outlineStr = buildOutlineString(chapter);

        console.log(578, "收集该章所有 features  问题很可能出在这里，因为是一章一章写的，而表格却是加到一节一节里面的")
        let allFeatures = [];
        function collectFeatures(node) {
            if (node.features) allFeatures = allFeatures.concat(node.features);
            if (node.children) node.children.forEach(collectFeatures);
        }
        collectFeatures(chapter);
        allFeatures = [...new Set(allFeatures)];

        // 构建提示词（传入 targetWords）
        const prompt = buildChapterPrompt(
            chapter,
            title,
            degreeName,
            allPreviousContent,
            feedContent,
            targetWords,      // 目标字数（用于计算区间）
            outlineStr
        );

        let finalPrompt = prompt;
        if (thesisBody) {
            finalPrompt += `\n前面已生成的章节内容（请保持行文连贯，逻辑衔接）：\n${thesisBody}\n`;
        }

        const nowPrompt = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(604, `[${nowPrompt}] [生成章节 ${chapter.title}] 提示词字符数: ${finalPrompt.length}`);
        await logConversation(`06_${chapter.title}_request`, finalPrompt, '', `章节索引=${i+1}`);

        let content;
        try {
            content = await callGLM(finalPrompt);
        } catch (err) {
            await logConversation(`06_${chapter.title}_error`, finalPrompt, '', `错误: ${err.message}`);
            throw err;
        }

        await logConversation(`06_${chapter.title}_response`, finalPrompt, content, `响应长度=${content.length}`);

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
        const nowDone = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(631, `[${nowDone}] ⏳ 章节 ${chapter.title} 生成完成，等待 20 秒后继续...`);
        await sleep(20000);
        await logConversation(`thesisBody_after_${i+1}`, '', '', `累积 thesisBody 长度=${thesisBody.length} 字符`);
    }

    // ---- 生成摘要 ----
    const fullThesisText = `# ${title}\n\n${thesisBody}`;
    const abstractPrompt = `
为论文"${title}"撰写摘要内容，包括中文摘要和英文摘要（Abstract）。
以下是论文正文全文：
${fullThesisText}
请基于此撰写摘要。
中文摘要约${isPostgraduate ? '400' : '300'}字，英文摘要约${isPostgraduate ? '250' : '200'}词，概括研究背景、方法、结果和结论。
**输出格式**：首先输出中文摘要正文（不要加“中文摘要”标题），空一行，接着输出英文摘要正文（不要加“Abstract”标题）。
只输出正文内容，不要包含任何标题或标签。
${extra}
`;
    const nowAbstract = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(649, `[${nowAbstract}] 开始生成摘要...`);
    const abstractText = await callGLM(abstractPrompt);
    await logConversation('07_摘要', abstractPrompt, abstractText);
    const parts = abstractText.split(/\n\s*\n/);
    let chineseAbstract = parts[0] || '（中文摘要内容）';
    let englishAbstract = parts[1] || '（English abstract content）';
    chineseAbstract = chineseAbstract.replace(/^中文摘要[:：]\s*/i, '');
    englishAbstract = englishAbstract.replace(/^Abstract[:：]\s*/i, '');

    // ---- 生成参考文献 ----
    const refPrompt = `
根据以下论文正文内容，生成符合GB/T 7714格式的参考文献列表，至少${isPostgraduate ? '25' : '15'}篇。
**重要要求**：
- 参考文献必须真实、可查，不可凭空编造。
- 每条文献必须包含完整信息：作者、题名、刊名/出版社、年份、卷期、页码等。
- 格式示例：[1] 作者. 题名[J]. 刊名, 年, 卷(期): 页码.
论文正文：
${fullThesisText}
只输出参考文献列表，不要加标题。
`;
    const nowRef = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(670, `[${nowRef}] 开始生成参考文献...`);
    const references = await callGLM(refPrompt);
    await logConversation('08_参考文献', refPrompt, references);

    // ---- 最终组装 ----
    const fullPaper = `# ${title}\n\n# 摘要\n\n${chineseAbstract}\n\n# Abstract\n\n${englishAbstract}\n\n${thesisBody}\n\n# 参考文献\n\n${references}\n`;
    const thesisFile = `${taskId}_06_正式论文.md`;
    const thesisMdPath = path.join(OUTPUT_DIR, thesisFile);
    await fs.writeFile(thesisMdPath, fullPaper, 'utf-8');
    const nowSave = new Date().Format("yyyy-MM-dd hh:mm:ss");
    console.log(680, `[${nowSave}] ✅ 正式论文 MD 已保存: ${thesisMdPath}`);

    try {
        const thesisDocxPath = thesisMdPath.replace(/\.md$/, '.docx');
        await convertMdToDocx(thesisMdPath, thesisDocxPath);
        const nowDocx = new Date().Format("yyyy-MM-dd hh:mm:ss");
        console.log(686, `[${nowDocx}] ✅ 正式论文 DOCX 已生成: ${thesisDocxPath}`);

    } catch (err) {
        console.error(`⚠️ 转换正式论文为 DOCX 失败:`, err.message);
    }

    return {
        domain: `${taskId}_01_领域分析.md`,
        literature: `${taskId}_02_文献综述.md`,
        titleResearch: `${taskId}_03_标题研究.md`,
        proposal: `${taskId}_04_开题报告.md`,
        thesis: `${taskId}_06_正式论文.md`,
    };
}

module.exports = {
    generateFullThesis,
    generateFullThesisWithOutline
};