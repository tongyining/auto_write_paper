// common/taskRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { readTasks, writeTasks } = require('./taskManager');

const OUTPUT_DIR = path.join(__dirname, '../output');

// ---------- GET /api/tasks ----------
router.get('/api/tasks', async (req, res) => {
    console.log(12, '/api/tasks', new Date().Format("yyyy-MM-dd hh:mm:ss"));
    const tasks = await readTasks();
    const role = req.role; // 由 authMiddleware 设置

    if (role === 'admin') {
        // 管理员返回全部
        return res.json(tasks);
    } else {
        // 普通用户按 userId 过滤
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: '缺少userId参数' });
        }
        const filtered = tasks.filter(t => t.userId === userId);
        return res.json(filtered);
    }
});

// ---------- GET /api/download/:taskId ----------
router.get('/api/download/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const { type, format = 'md', userId } = req.query;
    console.log(34, `[下载请求] taskId=${taskId}, type=${type}, format=${format}`);

    const tasks = await readTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        return res.status(404).json({ error: '任务不存在' });
    }

    // 权限校验
    const role = req.role;
    if (role !== 'admin') {
        if (!userId || task.userId !== userId) {
            return res.status(403).json({ error: '无权下载此文件' });
        }
    }

    const fileKey = type || 'thesis';
    const filename = task.files[fileKey];
    if (!filename) {
        return res.status(404).json({ error: `文件 ${fileKey} 不存在` });
    }

    let filePath = path.join(OUTPUT_DIR, filename);
    let displayName = `${task.title}_${fileKey}`;

    if (format === 'docx') {
        filePath = filePath.replace(/\.md$/, '.docx');
        displayName += '.docx';
        try {
            await fs.access(filePath);
        } catch (err) {
            return res.status(404).json({ error: 'DOCX 文件尚未生成，请稍后再试' });
        }
    } else {
        displayName += '.md';
        try {
            await fs.access(filePath);
        } catch (err) {
            return res.status(404).json({ error: 'MD 文件不存在' });
        }
    }

    res.download(filePath, displayName, (err) => {
        if (err) {
            console.error(`[下载错误] 发送文件失败:`, err.message);
        } else {
            console.log(80, `[下载成功] 文件 ${displayName} 已发送`);
        }
    });
});

module.exports = router;