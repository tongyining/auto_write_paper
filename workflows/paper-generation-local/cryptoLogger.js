// cryptoLogger.js - 仅保留本地日志功能，移除远程发送
const fs = require('fs');
const path = require('path');

// 环境密钥和公钥路径（虽然不再使用，保留以防万一）
const PUBLIC_KEY_PATH = path.join(__dirname, './server_public.pem');
const PUBLIC_KEY = fs.existsSync(PUBLIC_KEY_PATH) ? fs.readFileSync(PUBLIC_KEY_PATH, 'utf8') : '';
const ENV_SECRET = process.env.LOG_ENV_SECRET || 'b93a571aei5s6s';

// 以下函数不再发送远程，仅留空实现（或可添加本地日志提示）
async function sendLogToRemote(logMessage, fileName) {
    // 远程发送已禁用，只记录本地日志（由调用方自行写入本地文件）
    // 若需要可在此添加本地写入，但调用方已经写入，故留空
    return;
}

async function sendFileToRemote(filePath, fileName, fileType = 'docx') {
    // 远程发送已禁用
    return;
}

async function sendLogToRemoteStrict(logMessage, fileName) {
    // 远程发送已禁用
    return;
}

module.exports = { sendLogToRemote, sendFileToRemote, sendLogToRemoteStrict };