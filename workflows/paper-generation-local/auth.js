// common/auth.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const envPath = path.resolve(__dirname, '../../.env'); // 根据实际层级调整
dotenv.config({ path: envPath });

const AUTH_COOKIE_NAME = 'thesis_auth_token';
const AUTH_COOKIE_MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 3天
const SECRET_KEY = process.env.AUTH_SECRET_KEY;
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;
// console.log(13, process.env);
// 校验密钥是否配置
if (!SECRET_KEY) {
    console.error('❌ 未配置AUTH_SECRET_KEY，请在.env文件中设置');
    loadApiKey()
}


function loadApiKey() {
    // 1. 尝试读取当前目录的 .env
    // dotenv.config();
    let key = process.env.ZHIPUAI_API_KEY;
    if (key && key.trim()) return key;

    // 2. 若没有，尝试读取备用路径
    const fallbackPath = path.resolve('C:/node/local_lunwen_ai/hermes/skills/nodeproject/.env');
    if (fs.existsSync(fallbackPath)) {
        const content = fs.readFileSync(fallbackPath, 'utf-8');
        const parsed = dotenv.parse(content);
        if (parsed.ZHIPUAI_API_KEY && parsed.ZHIPUAI_API_KEY.trim()) {
            process.env.ZHIPUAI_API_KEY = parsed.ZHIPUAI_API_KEY;
            return parsed.ZHIPUAI_API_KEY;
        }
    }

    // 3. 都没有则打印错误并退出进程
    console.error('❌ 未找到 ZHIPUAI_API_KEY，请检查 .env 文件');
    process.exit(1);
}

// 验证页面 HTML（内嵌）
const AUTH_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>访问验证</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; box-shadow: 0 0 10px #ccc; border-radius: 8px; }
        h2 { text-align: center; color: #333; }
        input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
        button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0056b3; }
        .error { color: red; text-align: center; margin-top: 10px; display: none; }
        .success { color: green; text-align: center; margin-top: 10px; display: none; }
    </style>
</head>
<body>
    <h2>请输入访问密钥</h2>
    <input type="password" id="secretKey" placeholder="请输入私密密钥" />
    <button onclick="verify()">验证</button>
    <div class="error" id="errorMsg">密钥错误，请重试</div>
    <div class="success" id="successMsg">验证成功，正在跳转...</div>

    <script>
        function verify() {
            const key = document.getElementById('secretKey').value.trim();
            if (!key) {
                showError('请输入密钥');
                return;
            }
            fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: key })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('errorMsg').style.display = 'none';
                    document.getElementById('successMsg').style.display = 'block';
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    showError(data.message || '验证失败');
                }
            })
            .catch(err => {
                showError('网络错误，请重试');
                console.error(err);
            });
        }

        function showError(msg) {
            document.getElementById('errorMsg').textContent = msg;
            document.getElementById('errorMsg').style.display = 'block';
            document.getElementById('successMsg').style.display = 'none';
        }

        // 回车提交
        document.getElementById('secretKey').addEventListener('keypress', e => {
            if (e.key === 'Enter') verify();
        });
    </script>
</body>
</html>
`;

// ---------- 获取真实 IP（用于日志） ----------
const TRUSTED_PROXY_IPS = ['127.0.0.1', '::1'];
function getRealIP(req) {
    let remoteIp = req.socket.remoteAddress;
    if (remoteIp && remoteIp.startsWith('::ffff:')) remoteIp = remoteIp.slice(7);
    if (TRUSTED_PROXY_IPS.includes(remoteIp)) {
        const xff = req.headers['x-forwarded-for'];
        if (xff) {
            const firstIp = xff.split(',')[0].trim();
            if (firstIp && firstIp !== 'unknown') return firstIp;
        }
        const realIp = req.headers['x-real-ip'];
        if (realIp) return realIp;
    }
    return remoteIp || req.ip || '0.0.0.0';
}

// ---------- 认证中间件 ----------
function authMiddleware(req, res, next) {
    // 放过验证接口和退出接口
    if (req.path === '/api/auth/verify' || req.path === '/api/auth/logout') {
        return next();
    }
    // console.log(134, req.query)
    const authToken = req.signedCookies[AUTH_COOKIE_NAME];
    const masked = authToken ? authToken.slice(0, 4) + '****' : '无';
    console.log(137, `[认证] 收到Cookie: ${masked}, 原始IP: ${getRealIP(req)}`);

    let role = null;
    if (authToken === ADMIN_SECRET_KEY) {
        role = 'admin';
    } else if (authToken === SECRET_KEY) {
        role = 'user';
    }

    if (role) {
        req.role = role;
        console.log(148, `[认证] ${role} 访问 ${req.path}`);
        return next();
    } else {
        console.log(151, `[认证] Cookie无效或缺失，返回验证页面，访问 ${req.path}`);
        return res.send(AUTH_HTML);
    }
}

// ---------- 认证路由 ----------
router.post('/api/auth/verify', express.json(), (req, res) => {
    const { secret } = req.body;
    // console.log(159, req.query, req.body, ADMIN_SECRET_KEY, process.env.ADMIN_SECRET_KEY);
    let role = null;
    if (secret === ADMIN_SECRET_KEY) {
        role = 'admin';
    } else if (secret === SECRET_KEY) {
        role = 'user';
    }
    if (role) {
        res.cookie(AUTH_COOKIE_NAME, secret, {
            httpOnly: true,
            secure: true,      // 生产环境需启用 HTTPS
            sameSite: 'strict',
            maxAge: AUTH_COOKIE_MAX_AGE,
            path: '/',
            signed: true,
        });
        console.log(175, '[认证] 密钥验证成功，已配置Cookie');
        return res.json({ success: true, role });
    } else {
        console.log(178, '[认证] 密钥验证失败');
        return res.json({ success: false, message: '密钥错误' });
    }
});

router.post('/api/auth/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/'
    });
    console.log(190, '[认证] 用户已退出，Cookie已清除');
    res.json({ success: true });
});

module.exports = {
    authMiddleware,
    router
};