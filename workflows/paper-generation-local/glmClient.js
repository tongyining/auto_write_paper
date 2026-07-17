// workflows/paper-generation-单机/glmClient.js
const axios = require('axios');
const { sleep } = require('./helpers');
const { loadConfig } = require('./userConfig'); // 注意路径
const { loadApiKey } = require('./loadEnv');

const RETRY_CONFIG = {
    maxRetries: 3,
    retryDelay: 60000,
    retryableErrors: ['ETIMEDOUT', 'ECONNRESET', '429', '500', '502']
};

/**
 * 调用大模型接口（从 user_config.json 读取配置）
 * @param {string} prompt - 提示词
 * @param {number} retryCount - 重试计数（内部递归使用）
 * @returns {Promise<string>}
 */
async function callGLM(prompt, retryCount = 0) {
    // 加载配置
    let config = await loadConfig();
    let apiKey, apiUrl, model, provider;
    
    // 优先从网页配置读取
    if (config && config.apiKey && config.apiUrl && config.model) {
        console.log(26, "网页版有key")
        apiKey = config.apiKey;
        apiUrl = config.apiUrl;
        model = config.model;
        provider = config.provider || 'zhipu';
    } else {
        console.log(32, "网页版没有key，尝试从本地读取")
        // 尝试从环境变量加载（本地 .env 或备用路径）
        const envKey = loadApiKey();
        if (envKey) {
            // 从 api.js 获取默认的 URL 和 MODEL（如果有）
            let defaultConfig;
            try {
                defaultConfig = require('./api');
            } catch (e) {
                // 忽略
            }
            if (defaultConfig && defaultConfig.API_URL && defaultConfig.MODEL) {
                apiUrl = defaultConfig.API_URL;
                model = defaultConfig.MODEL;
                provider = defaultConfig.provider || 'zhipu';
            } else {
                // 硬编码默认值（智谱）
                apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
                model = 'GLM-4-Flash';
                provider = 'zhipu';
            }
            apiKey = envKey;
        } else {
            throw new Error('请先设置 API 配置（Key/模型）');
        }
    }

    console.log(59, { apiKey: apiKey.slice(0, 8)+'...', apiUrl, model, provider });

    if (retryCount > RETRY_CONFIG.maxRetries) {
        throw new Error(`API 调用失败，已重试 ${RETRY_CONFIG.maxRetries} 次`);
    }

    // 构建请求体（兼容 OpenAI 格式）
    const payload = {
        model: model,
        max_tokens: 18096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
    };
    console.log(72, payload);
    try {
        const response = await axios.post(apiUrl, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 1200000,
        });

        // 提取内容（兼容多种返回格式）
        let content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
            content = response.data?.output?.text ||
                      response.data?.result?.output?.text ||
                      response.data?.text ||
                      '';
        }
        if (!content || content.trim() === '') {
            throw new Error('API 返回空内容');
        }
        return content;
    } catch (err) {
        const status = err.response?.status || '';
        const errorMsg = err.message || '';

        const shouldRetry = RETRY_CONFIG.retryableErrors.includes(String(status)) ||
                            RETRY_CONFIG.retryableErrors.includes(err.code) ||
                            errorMsg.includes('返回空内容') ||
                            (err.isAxiosError && !err.response);

        if (!shouldRetry) {
            throw err;
        }

        const waitTime = status === 429 ? 60000 : RETRY_CONFIG.retryDelay;
        console.log(108, `⏳ 等待 ${waitTime/1000} 秒后重试...`);
        await sleep(waitTime);
        return callGLM(prompt, retryCount + 1);
    }
}

// 新增：测试连接（使用临时配置，不依赖 loadConfig）
async function testConnection(apiConfig) {
    const { apiKey, apiUrl, model, provider = 'zhipu' } = apiConfig;
    console.log(117, apiKey, apiUrl, model, provider);
    if (!apiKey || !apiUrl || !model) {
        throw new Error('缺少 API 配置参数');
    }

    const payload = {
        model: model,
        max_tokens: 100,
        messages: [{ role: 'user', content: '请用中文回答：1+1等于几？只需输出数字结果。' }],
        temperature: 0.7,
    };

    try {
        const response = await axios.post(apiUrl, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });

        let content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
            content = response.data?.output?.text || response.data?.result?.output?.text || '';
        }
        if (!content || content.trim() === '') {
            throw new Error('API 返回空内容');
        }
        return content;
    } catch (err) {
        throw err; // 直接抛出，由上层处理
    }
}

module.exports = { callGLM, testConnection };