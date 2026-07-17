// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();
require('./helpers');
const app = express();
const PORT = 3000;

// 中间件
app.use(cookieParser('your-secret-sign-key'));
app.use(cors());
app.use(bodyParser.json({
    limit: '10mb'
}));

// 1. 公共认证中间件（拦截所有请求，校验 Cookie）
app.use(require('./auth').authMiddleware);

// 2. 公共认证路由（/api/auth/verify, /api/auth/logout）
app.use(require('./auth').router);

app.use('/api/config', require('./config_test_save_key')); // 新增配置路由

app.use('/api/local2', require('./routes'));
app.use('/api', require('./feedbackRoutes'));

// 4. 通用任务管理路由（/api/tasks, /api/download）
app.use(require('./taskRoutes'));

// 5. 前端静态资源
app.use(express.static('../../dist'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});