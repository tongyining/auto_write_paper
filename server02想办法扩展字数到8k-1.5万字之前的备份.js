const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const {
    exec
} = require('child_process');
require('dotenv').config();
const {
    v4: uuidv4
} = require('uuid'); // 需要安装: npm install uuid

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('dist'))

// 数据文件路径
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

const API_KEY = process.env.ZHIPUAI_API_KEY;
console.log(27, 'API_KEY loaded:', !!API_KEY); // 输出 true 或 false

// 确保输出目录存在
async function ensureOutputDir() {
    try {
        await fs.mkdir(OUTPUT_DIR, {
            recursive: true
        });
    } catch (err) {}
}

// 读取任务列表
async function readTasks() {
    try {
        const data = await fs.readFile(TASKS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// 写入任务列表
async function writeTasks(tasks) {
    await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// 生成论文的异步函数（调用已有的 thesis-writer.js 逻辑）
// 这里我们直接使用子进程调用你写好的脚本，并传递标题
function runThesisWriter(title, taskId) {
    return new Promise((resolve, reject) => {
        // 注意：假设 thesis-writer.js 接收标题作为参数，并输出文件到当前目录
        // 但我们希望输出到 OUTPUT_DIR 并自定义文件名，所以需要修改一下脚本或传入参数
        // 简单起见，我们直接调用一个包装脚本，或修改原脚本支持 -o 参数。
        // 这里我们采用另一种方式：直接调用原脚本，然后将生成的文件移动到 output 目录并重命名。
        // 但为了演示，我们改造一下：我们创建一个临时脚本，内部调用 API 并写入指定路径。
        // 更实用的方式：将 thesis-writer.js 改造为可导出的函数，这里 require 进来。
        // 为了快速跑通，我们直接在服务器端用 child_process 调用 node 命令，传递标题和输出路径。
        const outputFile = path.join(OUTPUT_DIR, `${taskId}.md`);
        // 调用你的 thesis-writer.js，但我们需要让它接受 --title 和 --output 参数
        // 由于之前脚本是硬编码的，我们稍作调整，改为从环境变量或参数读取。
        // 或者我们直接在服务器内嵌生成逻辑，但复用之前的 callGLM 函数。
        // 这里我推荐将 thesis-writer.js 改写为模块，导出一个函数 generateThesis(title, outputPath)
        // 然后在这里 require 并调用。
        // 为了快速演示，我提供一个简化的生成函数，直接集成到这里（复用了之前的 callGLM）。
        // 下面的代码实际是内联的生成逻辑（避免额外文件），但你可以保留自己的脚本。

        // 实际开发，建议重构 thesis-writer.js 为模块：
        // const { generateThesis } = require('./thesis-writer');
        // generateThesis(title, outputFile).then(resolve).catch(reject);

        // 这里演示一个简化版本（内联实现）：
        const axios = require('axios');
        // const API_KEY = process.env.ZHIPUAI_API_KEY;
        const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

        async function generate() {
            try {
                // 1. 生成开题报告
                const proposal = await callGLM(`请为"${title}"撰写一份本科开题报告，包含：题目、研究背景与意义、国内外研究现状、研究内容与方法、进度安排。`);
                // 2. 文献综述
                const lit = await callGLM(`请为"${title}"撰写一篇详细的文献综述，涵盖该领域的研究背景、主要技术路线、国内外研究现状、存在的问题及未来趋势。要求内容充实，引用真实存在的经典文献。`);
                // 3. 正文（简化：只生成一章）
                const body = await callGLM(`请撰写论文"${title}"的"研究内容与实现"章节，详细描述方法、实验和结果。`);
                // 4. 参考文献
                const refs = await callGLM(`根据以上内容，生成符合 GB/T 7714 格式的参考文献列表。`);

                const finalDoc = `# ${title}\n\n**日期**：${new Date().toLocaleDateString()}\n\n---\n\n# 开题报告\n\n${proposal}\n\n---\n\n# 文献综述\n\n${lit}\n\n---\n\n# 正文\n\n${body}\n\n---\n\n# 参考文献\n\n${refs}\n`;
                await fs.writeFile(outputFile, finalDoc, 'utf-8');
                resolve();
            } catch (err) {
                reject(err);
            }
        }

        async function callGLM(prompt) {
            const response = await axios.post(API_URL, {
                model: 'GLM-4-Flash',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                temperature: 0.7,
            }, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            });
            return response.data.choices[0].message.content;
        }

        generate().then(resolve).catch(reject);
    });
}

// API: 提交生成任务
app.post('/api/generate', async (req, res) => {
    const {
        title
    } = req.body;
    if (!title) {
        return res.status(400).json({
            error: '标题不能为空'
        });
    }

    const taskId = uuidv4();
    const newTask = {
        id: taskId,
        title: title,
        status: 'pending', // pending, generating, done, error
        filename: `${taskId}.md`,
        createdAt: new Date().toISOString(),
        error: null
    };

    // 保存任务
    const tasks = await readTasks();
    tasks.push(newTask);
    await writeTasks(tasks);

    // 异步执行生成（不阻塞响应）
    runThesisWriter(title, taskId)
        .then(async () => {
            // 更新状态为 done
            const tasks = await readTasks();
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                task.status = 'done';
                await writeTasks(tasks);
            }
        })
        .catch(async (err) => {
            console.error('生成失败:', err);
            const tasks = await readTasks();
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                task.status = 'error';
                task.error = err.message;
                await writeTasks(tasks);
            }
        });

    res.json({
        taskId,
        status: 'pending'
    });
});

// API: 获取所有任务
app.get('/api/tasks', async (req, res) => {
    const tasks = await readTasks();
    res.json(tasks);
});

// API: 下载文件
app.get('/api/download/:taskId', async (req, res) => {
    const {
        taskId
    } = req.params;
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        return res.status(404).json({
            error: '任务不存在'
        });
    }
    const filePath = path.join(OUTPUT_DIR, task.filename);
    try {
        await fs.access(filePath);
        res.download(filePath, `${task.title}.md`);
    } catch(err) {
        console.log(200, err)
        res.status(404).json({
            error: '文件不存在'
        });
    }
});

// 启动服务器
ensureOutputDir().then(() => {
    app.listen(PORT,'0.0.0.0', () => {
        console.log(210, `Server running on http://1:${PORT}`);
    });
});