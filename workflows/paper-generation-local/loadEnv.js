const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

function loadApiKey() {
    // 1. 尝试读取当前目录的 .env
    dotenv.config();
    let key = process.env.ZHIPUAI_API_KEY;
    console.log("env有key")
    if (key && key.trim()) return key;
    console.log("env没有key")
    // 2. 若没有，尝试读取备用路径
    const fallbackPath = path.resolve('C:/node/local_lunwen_ai/hermes/skills/nodeproject/.env');
    if (fs.existsSync(fallbackPath)) {
        console.log("指定路径有key")
        const content = fs.readFileSync(fallbackPath, 'utf-8');
        const parsed = dotenv.parse(content);
        if (parsed.ZHIPUAI_API_KEY && parsed.ZHIPUAI_API_KEY.trim()) {
            process.env.ZHIPUAI_API_KEY = parsed.ZHIPUAI_API_KEY;
            return parsed.ZHIPUAI_API_KEY;
        }
    }

    // 3. 都没有则返回 null（不再退出进程）
    console.warn('⚠️ 未找到 ZHIPUAI_API_KEY，请检查 .env 文件或使用网页配置');
    return null;
}

module.exports = { loadApiKey };