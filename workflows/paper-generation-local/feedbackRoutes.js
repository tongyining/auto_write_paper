const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { readTasks, writeTasks } = require('./taskManager');

// 评价文件存放目录（与论文文件同目录）
const OUTPUT_DIR = path.join(__dirname, '../../output');

// 生成带毫秒的时间戳
function getTimestamp() {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${y}${mo}${d}_${h}${mi}${s}_${ms}`;
}

// POST /api/feedback - 提交评价
router.post('/feedback', async (req, res) => {
    const { taskId, rating, comment } = req.body;
    console.log("/feedback", taskId, rating, comment);
    if (!taskId || rating === undefined || rating === null) {
        return res.status(400).json({ error: '缺少 taskId 或 rating' });
    }
    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 10) {
        return res.status(400).json({ error: '评分必须是 0 到 10 的数字' });
    }
    const commentText = (comment || '').trim();
    if (commentText.length > 5000) {
        return res.status(400).json({ error: '评论文本超过 5000 字限制' });
    }

    // 读取任务
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        return res.status(404).json({ error: '任务不存在' });
    }

    // 构造评价内容（Markdown格式）
    const timestamp = getTimestamp();
    const content = `# 评价反馈
- **任务ID**: ${taskId}
- **任务标题**: ${task.title || '无'}
- **评分**: ${ratingNum} / 10
- **评价时间**: ${new Date().toLocaleString('zh-CN', { hour12: false })}
- **建议内容**:
${commentText || '（未填写）'}
`;

    const filename = `${taskId}_feedback_${timestamp}.md`;
    const filePath = path.join(OUTPUT_DIR, filename);

    try {
        // 确保输出目录存在
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        // 写入本地文件
        await fs.writeFile(filePath, content, 'utf-8');
        console.log(`评价已保存到本地: ${filePath}`);

        // 更新任务记录
        if (!task.feedbacks) task.feedbacks = [];
        task.feedbacks.push(filename);
        await writeTasks(tasks);

        res.json({ success: true, filename });
    } catch (err) {
        console.error('保存评价失败:', err.message);
        res.status(500).json({ error: '保存评价失败: ' + err.message });
    }
});

// GET /api/feedback/:taskId - 获取某任务的所有评价文件名
router.get('/feedback/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        return res.status(404).json({ error: '任务不存在' });
    }
    res.json({ feedbacks: task.feedbacks || [] });
});

module.exports = router;