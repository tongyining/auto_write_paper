const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const cookieParser = require('cookie-parser'); 
require('dotenv').config();
const {
    v4: uuidv4
} = require('uuid');

const { convertMdToDocx } = require('./md2docx_custom_node_server.js');

// ================== 身份验证配置（新增） ==================
const AUTH_COOKIE_NAME = 'thesis_auth_token';
const AUTH_COOKIE_MAX_AGE = 3 * 24 * 60 * 60 * 1000; // ✅ 3天有效期，单位毫秒
const SECRET_KEY = process.env.AUTH_SECRET_KEY;

// 校验密钥是否配置
if (!SECRET_KEY) {
    console.error('❌ 未配置AUTH_SECRET_KEY，请在.env文件中设置');
    process.exit(1);
}
// ✅ 新增：验证页面HTML（无需额外文件，直接内嵌）
const AUTH_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>访问验证</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; box-shadow: 0 0 10px #ccc; border-radius: 8px; }
        h2 { text-align: center; color: #333; }
        input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0056b3; }
        .error { color: red; text-align: center; margin-top: 10px; display: none; }
        .success { color: green; text-align: center; margin-top: 10px; display: none; }
    </style>
</head>
<body>
    <h2>请输入访问密钥</h2>
    <input type="password" id="secretKey" placeholder="请输入私密密钥" />
    <button onclick="verify()">验证</button>
    <div class="error" id="errorMsg">密钥错误，请重试</div>
    <div class="success" id="successMsg">验证成功，正在跳转...</div>

    <script>
        function verify() {
            const key = document.getElementById('secretKey').value.trim();
            if (!key) {
                showError('请输入密钥');
                return;
            }
            fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: key })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('errorMsg').style.display = 'none';
                    document.getElementById('successMsg').style.display = 'block';
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    showError(data.message || '验证失败');
                }
            })
            .catch(err => {
                showError('网络错误，请重试');
                console.error(err);
            });
        }

        function showError(msg) {
            document.getElementById('errorMsg').textContent = msg;
            document.getElementById('errorMsg').style.display = 'block';
            document.getElementById('successMsg').style.display = 'none';
        }

        // 回车提交
        document.getElementById('secretKey').addEventListener('keypress', e => {
            if (e.key === 'Enter') verify();
        });
    </script>
</body>
</html>
`;


Date.prototype.Format = function(fmt) {
    // 获取当前时间
    var now = new Date();
    // 获取当前时区偏移量（分钟数）
    var timezoneOffset = 720//now.getTimezoneOffset();
    // 创建新的 Date 对象，加上时区偏移量
    // var localTime = new Date(now.getTime() + timezoneOffset * 60 * 1000);
    var localTime = new Date(now.getTime());
    // var time=localTime.getMonth()+1+"月"+localTime.getDate()+"日"+localTime.getHours()+"点"+localTime.getMinutes()+"分";
    // console.log(102, time)
    var o = {
        "M+": localTime.getMonth() + 1, //月份 
        "d+": localTime.getDate(), //日 
        "h+": localTime.getHours(), //小时 
        "m+": localTime.getMinutes(), //分 
        "s+": localTime.getSeconds(), //秒 
        "q+": Math.floor((localTime.getMonth() + 3) / 3), //季度 
        "S": localTime.getMilliseconds() //毫秒 
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (localTime.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}
const app = express();
const PORT = 3000;

// ================== 基础中间件（调整顺序） ==================
app.use(cookieParser()); // ✅ 新增：放在最前面，解析Cookie
app.use(cors());
// app.use(bodyParser.json({ limit: '10mb' }));

app.use(bodyParser.json({
    limit: '10mb'
}));
const TRUSTED_PROXY_IPS = ['127.0.0.1', '::1'];
function getRealIP(req) {
    let remoteIp = req.socket.remoteAddress;
    if (remoteIp && remoteIp.startsWith('::ffff:')) remoteIp = remoteIp.slice(7);

    if (TRUSTED_PROXY_IPS.includes(remoteIp)) {
        const xff = req.headers['x-forwarded-for'];
        if (xff) {
            const firstIp = xff.split(',')[0].trim();
            if (firstIp && firstIp !== 'unknown') {
                return firstIp;
            }
        }
        const realIp = req.headers['x-real-ip'];
        if (realIp) return realIp;
    }
    return remoteIp || req.ip || '0.0.0.0';
}
app.use((req, res, next) => {
    // 验证接口本身不需要校验Cookie
    if (req.path === '/api/auth/verify') {
        return next();
    }
    console.log(151, getRealIP(req));
    const authToken = req.cookies[AUTH_COOKIE_NAME];
    if (authToken === SECRET_KEY) {
        // 验证通过，继续后续逻辑
        console.log(155, `[认证] Cookie验证通过，访问${req.path}`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
        return next();
    } else {
        // 验证失败，返回验证页面（不会泄露任何后端资源）
        console.log(159, `[认证] Cookie缺失或无效，返回验证页面，访问${req.path}`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
        res.send(AUTH_HTML);
    }
});

// ================== 静态资源（放在认证中间件之后，会被拦截） ==================
app.use(express.static('dist'));

// ================== ✅ 新增：密钥验证接口 ==================
app.post('/api/auth/verify', express.json(), (req, res) => {
    const { secret } = req.body;
    console.log(170, secret, SECRET_KEY);
    if (secret === SECRET_KEY) {
        // 种Cookie：HttpOnly+Secure+SameSite，防XSS/CSRF
        res.cookie(AUTH_COOKIE_NAME, SECRET_KEY, {
            httpOnly: true,       // 禁止JS读取，防XSS
            secure: true,         // 仅HTTPS传输（ngrok是HTTPS，必须开）
            sameSite: 'strict',   // 防CSRF跨站请求伪造
            maxAge: AUTH_COOKIE_MAX_AGE, // 3天有效期
            path: '/',            // 全站有效
        });
        console.log(180, '[认证] 密钥验证成功，已种Cookie', new Date().Format("yyyy-MM-dd hh:mm:ss"));
        res.json({ success: true });
    } else {
        console.log(183, '[认证] 密钥验证失败', new Date().Format("yyyy-MM-dd hh:mm:ss"));
        res.json({ success: false, message: '密钥错误' });
    }
});

// ========== 配置 ==========
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const OUTPUT_DIR = path.join(__dirname, 'output');
const API_KEY = process.env.ZHIPUAI_API_KEY;
const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
console.log(193, '🔑 API_KEY loaded:', !!API_KEY, new Date().Format("yyyy-MM-dd hh:mm:ss"));

// ========== 工具函数 ==========
async function ensureOutputDir() {
    try {
        await fs.mkdir(OUTPUT_DIR, {
            recursive: true
        });
    } catch (err) {}
}

async function readTasks() {
    try {
        const data = await fs.readFile(TASKS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeTasks(tasks) {
    await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

async function callGLM(prompt) {
    const response = await require('axios').post(
        API_URL, {
            model: 'GLM-4.7-Flash',
            messages: [{
                role: 'user',
                content: prompt
            }],
            temperature: 0.7,
        }, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 240000,
        }
    );
    return response.data.choices[0].message.content;
}

// ========== 核心生成逻辑（携带上下文 + 分章节生成） ==========
async function generateFullThesis(taskId, title, degree, extraPrompt) {
    const isPostgraduate = degree === 'postgraduate';
    const degreeName = isPostgraduate ? '硕士' : '本科';
    const extra = extraPrompt ? `\n额外要求：${extraPrompt}` : '';
    const context = {}; // 存储各步骤内容 { '01_领域分析': '...', '02_文献综述': '...', ... }

    // 辅助：生成并保存单个文件，同时更新 context
    async function generateAndSave(stepKey, promptBuilder) {
        const prompt = promptBuilder(context);
        let content = await callGLM(prompt);
        // 对特定步骤可做额外清理（如去除可能的多余标题）
        const filename = `${taskId}_${stepKey}.md`;
        const filePath = path.join(OUTPUT_DIR, filename);
        await fs.writeFile(filePath, content, 'utf-8');
        context[stepKey] = content; // 缓存以备后续使用
        try {
            const docxPath = filePath.replace(/\.md$/, '.docx');
            await convertMdToDocx(filePath, docxPath);
        } catch (err) {
            console.error(`⚠️ 转换 ${filename} 为 DOCX 失败:`, err.message);
            // 不中断后续步骤
        }
        return filename;
    }

    // ----- 步骤1：领域分析（无上下文） -----
    await generateAndSave('01_领域分析', (ctx) => {
        return `请对论文题目"${title}"进行深入的领域分析。
1. 明确该论文所属的学科领域和研究方向。
2. 分析该领域的前沿分支，列举主要分支方向。
3. 针对每个分支，指出哪些国家、哪些研究团队在主导，有哪些代表性研究成果。
4. 总结当前领域的研究难点和主要分歧点。

**写作要求**：语言流畅自然，逻辑清晰，采用学术论文的分析性语言。
**格式要求**：使用Markdown，一级标题用#，二级标题用##，三级用###，列表用-或数字。
${extra}`;
    });

    // ----- 步骤2：文献综述（基于领域分析） -----
    await generateAndSave('02_文献综述', (ctx) => {
        const domain = ctx['01_领域分析'];
        return `基于以下领域分析报告（主题为"${title}"），撰写一份文献综述。

领域分析内容：
${domain}

要求：
1. 按照主要研究分支，从早期到近期梳理发展脉络。
2. 同时按照国内外分别整理，对比国内外研究差异。
3. 综述应包含具体的研究成果和对应的参考文献（至少${isPostgraduate ? '25' : '15'}篇）。
4. 文献格式符合GB/T 7714。

**写作风格**：叙述连贯，自然引出各分支的演变，避免机械式枚举。
**格式要求**：综述本身用#作为一级章节标题（如“# 文献综述”），内部小节用##，列表用-。
${extra}`;
    });

    // ----- 步骤3：标题研究（基于领域分析和文献综述） -----
    await generateAndSave('03_标题研究', (ctx) => {
        const domain = ctx['01_领域分析'];
        const lit = ctx['02_文献综述'];
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
    });

    // ----- 步骤4：开题报告（基于前三步） -----
    await generateAndSave('04_开题报告', (ctx) => {
        const domain = ctx['01_领域分析'];
        const lit = ctx['02_文献综述'];
        const titleResearch = ctx['03_标题研究'];
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
    });

    // ----- 步骤5：论文大纲（基于前四步） -----
    await generateAndSave('05_论文大纲', (ctx) => {
        const domain = ctx['01_领域分析'];
        const lit = ctx['02_文献综述'];
        const titleResearch = ctx['03_标题研究'];
        const proposal = ctx['04_开题报告'];
        return `基于以下内容为论文"${title}"生成一份详细的章节大纲。

领域分析：
${domain}

文献综述：
${lit}

标题研究：
${titleResearch}

开题报告：
${proposal}

**论文整体结构必须遵循以下通用框架**：
1. 绪论（包含研究背景与意义、国内外文献综述、研究方法与论文框架）
2. 现状分析（对研究对象当前状态的系统描述）
3. 问题剖析（提炼现有研究或实践中的不足、矛盾或空白）
4. 解决方案/创新性构建（提出改进框架、模型或策略）
5. 结论（总结成果、局限与未来展望）

**章节数量**：主体部分（除绪论和结论外）通常3~5章，总章数控制在5~7章。
**标题格式要求**：
- 章标题（如“第一章 绪论”）使用一级标题（#）
- 章内小节标题使用二级标题（##），如“## 1、研究背景”
- 子点使用三级标题（###），如“### 1..1 具体问题”

**输出要求**：只输出大纲，不展开内容，使用Markdown列表或标题。
${extra}`;
    });

    // ========== 步骤6：正式论文（分章节生成，携带完整上下文） ==========
    // 读取刚生成的大纲文件
    const outlineFile = `${taskId}_05_论文大纲.md`;
    const outlineContent = await fs.readFile(path.join(OUTPUT_DIR, outlineFile), 'utf-8');
    // 提取章标题（一级标题）
    const chapters = extractChaptersFromOutline(outlineContent);
    if (chapters.length < 3) {
        chapters.length = 0;
        chapters.push('绪论', '现状分析', '问题剖析', '解决方案', '结论');
    }

    // 准备所有前序内容（前五步）的合并文本（用于每章的背景）
    const allPreviousContent = `
${context['01_领域分析']}

${context['02_文献综述']}

${context['03_标题研究']}

${context['04_开题报告']}

${outlineContent}
`;

    let thesisBody = ''; // 累积已生成的章节正文（不包含标题）

    // 逐章生成
    for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        // 构建携带历史的提示词
        let chapterPrompt = `撰写论文"${title}"的"${ch}"章节的正文内容（${degreeName}论文）。\n\n`;
        chapterPrompt += `### 整体背景（包含领域分析、文献综述、标题研究、开题报告、大纲）：\n${allPreviousContent}\n\n`;
        if (thesisBody) {
            chapterPrompt += `### 前面已生成的章节内容（保持连贯）：\n${thesisBody}\n\n`;
        }
        chapterPrompt += `### 当前章节要求：\n- 内容充实，逻辑连贯，字数约${isPostgraduate ? '2500~3500' : '1500~2000'}字。\n`;
        chapterPrompt += `- 深度符合${degreeName}论文要求。\n`;
        chapterPrompt += `- 可包含必要的公式、图表描述或代码片段（如适用）。\n`;
        chapterPrompt += `- 引用相关文献（可参考前面已经搜集分析过的文献，但需格式规范）。\n`;
        chapterPrompt += `- **内部小节必须使用Markdown二级标题（##）加中文序号，例如“## 一、政策背景”**，不要使用无标记的文本。\n`;
        chapterPrompt += `- **更细的子点使用三级标题（###）加数字序号，例如“### 1. 具体措施”**。\n`;
        chapterPrompt += `- 语言自然流畅，避免生硬罗列，使用逻辑连接词。\n`;
        chapterPrompt += extra;

        let content = await callGLM(chapterPrompt);
        // 清理AI返回内容中可能带有的章节标题（避免重复）
        content = stripLeadingTitle(content, ch);

        // 将生成的章节正文加入累积（由程序添加一级标题）
        thesisBody += `\n# ${ch}\n\n${content}\n`;
    }

    // ===== 生成摘要（基于完整论文正文） =====
    const fullThesisText = `# ${title}\n\n${thesisBody}`; // 包含所有章节（不含摘要和参考文献）
    const abstractPrompt = `
为论文"${title}"撰写摘要内容，包括中文摘要和英文摘要（Abstract）。

以下是论文正文全文：
${fullThesisText}

请基于此撰写摘要。
中文摘要约300字，英文摘要约200词，概括研究背景、方法、结果和结论。
**输出格式**：首先输出中文摘要正文（不要加“中文摘要”标题），空一行，接着输出英文摘要正文（不要加“Abstract”标题）。
只输出正文内容，不要包含任何标题或标签。
${extra}
`;
    const abstractText = await callGLM(abstractPrompt);
    const parts = abstractText.split(/\n\s*\n/);
    let chineseAbstract = parts[0] || '（中文摘要内容）';
    let englishAbstract = parts[1] || '（English abstract content）';
    chineseAbstract = chineseAbstract.replace(/^中文摘要[:：]\s*/i, '');
    englishAbstract = englishAbstract.replace(/^Abstract[:：]\s*/i, '');

    // ===== 生成参考文献（基于完整论文正文） =====
    const refPrompt = `
根据以下论文正文内容，生成符合GB/T 7714格式的参考文献列表，至少${isPostgraduate ? '20' : '10'}篇。
论文正文：
${fullThesisText}
只输出参考文献列表，不要加标题。
`;
    const references = await callGLM(refPrompt);

    // ===== 组装最终论文 =====
    const fullPaper = `# ${title}\n\n# 摘要\n\n${chineseAbstract}\n\n# Abstract\n\n${englishAbstract}\n\n${thesisBody}\n\n# 参考文献\n\n${references}\n`;

    const thesisFile = `${taskId}_06_正式论文.md`;
    await fs.writeFile(path.join(OUTPUT_DIR, thesisFile), fullPaper, 'utf-8');

    return {
        domain: `${taskId}_01_领域分析.md`,
        literature: `${taskId}_02_文献综述.md`,
        titleResearch: `${taskId}_03_标题研究.md`,
        proposal: `${taskId}_04_开题报告.md`,
        outline: `${taskId}_05_论文大纲.md`,
        thesis: thesisFile,
    };
}

// 去除内容开头可能存在的与章节标题重复的一级标题
function stripLeadingTitle(content, chapterTitle) {
    const lines = content.split('\n');
    let startIdx = 0;
    // 检查前几行是否以 # 开头且包含章节标题（近似匹配）
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('# ')) {
            // 如果该行内容包含章节标题的关键词，则跳过该行及之后的空行
            // 这里简单判断：如果该行去除#后与章节标题相似（包含），则删除
            const titlePart = trimmed.replace(/^#+\s*/, '').trim();
            if (titlePart.includes(chapterTitle) || chapterTitle.includes(titlePart)) {
                startIdx = i + 1;
                // 跳过后续空行
                while (startIdx < lines.length && lines[startIdx].trim() === '') {
                    startIdx++;
                }
                break;
            }
        }
    }
    if (startIdx === 0) return content; // 未检测到重复标题
    return lines.slice(startIdx).join('\n');
}

// 从大纲文本中提取一级标题（章节标题）
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
        return ['绪论', '现状分析', '问题剖析', '解决方案', '结论'];
    }
    return chapters;
}

// ========== API 路由 ==========
app.post('/api/generate', async (req, res) => {
    console.log(522, '/api/generate', new Date().Format("yyyy-MM-dd hh:mm:ss"));
    const { title, degree = 'undergraduate', extraPrompt = '', userId } = req.body;
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
        files: {},          // 将在生成后填充
        createdAt: new Date().toISOString(),
        error: null,
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

            // 执行分步生成
            const files = await generateFullThesis(taskId, title, degree, extraPrompt);

            // 更新任务为 done，并保存文件列表
            tasks = await readTasks();
            task = tasks.find(t => t.id === taskId);
            if (task) {
                task.status = 'done';
                task.files = files;
                await writeTasks(tasks);
            }
        } catch (err) {
            console.error('生成失败:', err, new Date().Format("yyyy-MM-dd hh:mm:ss"));
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

app.get('/api/tasks', async (req, res) => {
    console.log(581, '/api/tasks', new Date().Format("yyyy-MM-dd hh:mm:ss"));
    let tasks = await readTasks();
    res.json(tasks);
});

app.get('/api/download/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const { type, format = 'md' } = req.query;

    const tasks = await readTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return res.status(404).json({ error: '任务不存在' });

    const fileKey = type || 'thesis';
    const filename = task.files[fileKey];
    if (!filename) return res.status(404).json({ error: `文件 ${fileKey} 不存在` });

    let filePath = path.join(OUTPUT_DIR, filename);
    let displayName = `${task.title}_${fileKey}`;

    if (format === 'docx') {
        filePath = filePath.replace(/\.md$/, '.docx');
        displayName += '.docx';
        try { await fs.access(filePath); } 
        catch(err) { return res.status(404).json({ error: 'DOCX 文件尚未生成，请稍后再试' }); }
    } else {
        displayName += '.md';
    }

    res.download(filePath, displayName);
});

ensureOutputDir().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(615, `🚀 Server running on http://0.0.0.0:${PORT}`, new Date().Format("yyyy-MM-dd hh:mm:ss"));
    });
});