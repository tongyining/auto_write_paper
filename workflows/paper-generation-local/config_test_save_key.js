// routes/config.js
const express = require('express');
const router = express.Router();

const {
    loadConfig,
    saveConfig,
    configExists
} = require('./userConfig');
const {
    callGLM
} = require('./glmClient');
const { testConnection } = require('./glmClient');

router.get('/status', async (req, res) => {
    console.log(16, "获取key的配置状态");
    const exists = await configExists();
    console.log(18, exists);
    res.json({
        configured: exists
    });
});

router.post('/setup', async (req, res) => {
    console.log(25, "进入验证前端的key路由")
    const {
        apiKey,
        apiUrl,
        model,
        provider
    } = req.body;
    console.log(32, apiKey, apiUrl, model, provider)
    if (!apiKey || !apiUrl || !model) {
        return res.status(400).json({
            success: false,
            error: '缺少必要参数'
        });
    }

    console.log(40, "测试连通性（使用1+1=？）")
    try {
        const reply = await testConnection({ apiKey, apiUrl, model, provider });
        console.log(43, reply);
        // 保存配置
        await saveConfig({
            apiKey,
            apiUrl,
            model,
            provider: provider || 'zhipu'
        });
        res.json({
            success: true,
            reply: reply.trim()
        });
    } catch (err) {
        console.log(56, err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;