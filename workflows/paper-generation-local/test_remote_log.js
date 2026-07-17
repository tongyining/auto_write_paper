// workflows/paper-generation-单机2/test_remote_log.js
const path = require('path');
const fs = require('fs');
Date.prototype.Format = function(fmt) {
    const o = {
        "M+": this.getMonth() + 1,
        "d+": this.getDate(),
        "h+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "q+": Math.floor((this.getMonth() + 3) / 3),
        "S": this.getMilliseconds()
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (let k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
};
// 引入远程日志发送函数
const { sendLogToRemote } = require('./cryptoLogger');
console.log(21, "sendLogToRemote");
// 检查必要的密钥文件是否存在
const PUBLIC_KEY_PATH = path.join(__dirname, './server_public.pem');
console.log(24, PUBLIC_KEY_PATH);
if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    console.error('❌ 公钥文件不存在:', PUBLIC_KEY_PATH);
    console.error('   请确保将 server_public.pem 放在 config/ 目录下');
    process.exit(1);
} else {
    console.log(30, '✅ 公钥文件存在');
}

// 检查环境变量 LOG_ENV_SECRET 是否设置（如果未设置，cryptoLogger.js 会使用默认值）
if (!process.env.LOG_ENV_SECRET) {
    console.warn('⚠️ 环境变量 LOG_ENV_SECRET 未设置，将使用默认值 "default-env-secret"');
    console.warn('   请确保远程服务器的 ENV_SECRET 与此值一致');
} else {
    console.log(38, '✅ LOG_ENV_SECRET =', process.env.LOG_ENV_SECRET);
}

// 模拟测试日志内容
const testLogContent = `[${new Date().Format("yyyy-MM-dd hh:mm:ss")}] [测试] 这是一条远程日志测试消息。\n`;

console.log(44, '\n📤 开始发送测试日志到远程服务器...');
console.log(45, '日志内容:', testLogContent.trim());

// 调用发送函数（传入文件名 test.log）
sendLogToRemote(testLogContent, 'test.log')
    .then(() => {
        console.log(50, '✅ 日志发送成功（未抛出异常）');
        console.log(51, '   请检查远程服务器 logs/ 目录下是否生成了 test.log 文件');
    })
    .catch((err) => {
        console.error('❌ 日志发送失败:', err.message);
        console.error('   请检查网络连接、服务器地址、端口、密钥配置等');
    });

// 由于 sendLogToRemote 是异步的，但我们没有 await，进程可能立即退出。
// 为了确保发送完成，我们等待一会儿。
setTimeout(() => {
    console.log(61, '\n测试结束，按任意键退出...');
}, 3000);