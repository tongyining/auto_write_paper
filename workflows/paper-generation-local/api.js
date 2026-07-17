// config/api.js
// 模型配置：切换时请注释掉其他配置，只保留一个激活的导出

// ---------- 智谱 AI 配置 ----------
const zhipuKeys = [
    process.env.ZHIPUAI_API_KEY,
    process.env.testzhuguan,
    process.env.testxingyue,
].filter(key => key && key.trim() !== '');   // 过滤掉空值

const zhipuConfig = {
    provider: 'zhipu',
    API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    // MODEL: 'GLM-4.7-Flash',
    MODEL: 'GLM-4-Flash',
    keys: zhipuKeys,                         // 新增：Key 数组
    API_KEY: zhipuKeys[0] || '',             // 保留第一个作为默认（兼容旧代码）
};

// ---------- DeepSeek 配置 ----------
// const deepseekConfig = {
//     provider: 'deepseek',
//     API_KEY: process.env.DEEPSEEK_API_KEY,
//     API_URL: 'https://api.deepseek.com/chat/completions',
//     MODEL: 'deepseek-v4-flash',
// };

// ============================================
// 当前激活的配置：取消注释需要的，注释掉其他的
// ============================================
module.exports = zhipuConfig;   // 使用智谱
// module.exports = deepseekConfig;   // 如需切换 DeepSeek，注释上一行，取消注释本行