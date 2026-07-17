const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');

/**
 * 加载环境变量（优先默认 .env，若缺失或为空则异步读取指定路径）
 * @returns {Promise<string|null>} 返回 API Key，若未找到则返回 null
 */
async function loadEnv() {
    // 1. 尝试默认同步加载（当前目录的 .env）
    dotenv.config();
    let apiKey = process.env.ZHIPUAI_API_KEY;
    console.log(14, apiKey)
    // 若 Key 不存在或为空字符串，则异步读取备用文件
    if (!apiKey || apiKey.trim() === '') {
        console.log(17, "若 Key 不存在或为空字符串")
        const specifiedPath = path.resolve('C:/node/local_lunwen_ai/hermes/skills/nodeproject/.env');
        try {
            const content = await fs.readFile(specifiedPath, 'utf-8');
            const parsed = dotenv.parse(content);
            if (parsed.ZHIPUAI_API_KEY && parsed.ZHIPUAI_API_KEY.trim() !== '') {
                apiKey = parsed.ZHIPUAI_API_KEY;
                // 可选：将读取到的 Key 写入 process.env，方便其他模块使用
                process.env.ZHIPUAI_API_KEY = apiKey;
                console.log(26, "process.env.ZHIPUAI_API_KEY")
            }
        } catch (err) {
            // 文件不存在或读取失败，不抛出错误，继续返回 null
            console.error('读取备用 .env 文件失败：', err.message);
        }
    }

    return apiKey || null;
}

async function callZhipuAI(apiKey) {
    const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    try {
        const response = await axios.post(
            API_URL,
            {
                model: 'GLM-4-Flash',
                messages: [{ role: 'user', content: '1+1=?' }],
                temperature: 0.7,
                stream: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const reply = response.data.choices[0].message.content;
        console.log(56, '模型回答：', reply);
    } catch (error) {
        if (error.response) {
            console.error('API 请求失败：', error.response.status, error.response.data);
        } else {
            console.error('请求错误：', error.message);
        }
    }
}

async function main() {
    // 等待环境变量加载完成（异步读取备用文件）
    const API_KEY = await loadEnv();

    if (!API_KEY) {
        console.error('错误：请在 .env 文件中设置 ZHIPUAI_API_KEY');
        // 程序不退出，继续执行（API 调用会因认证失败而报错）
    }

    // 即使 API_KEY 为 null，也会发起请求（后端会返回 401）
    await callZhipuAI(API_KEY);
}

main();