// common/userConfig.js
const fs = require('fs').promises;
const path = require('path');

const CONFIG_FILE = path.join(__dirname, './user_config.json');

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        console.log(10, data.length);
        if(data.length>0){
            return JSON.parse(data);
        }
        return null;
    } catch {
        return null; // 文件不存在或损坏
    }
}

async function saveConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function configExists() {
    const config = await loadConfig();
    // console.log(26, config);
    return config !== null && config.apiKey && config.apiUrl && config.model;
}

module.exports = {
    loadConfig,
    saveConfig,
    configExists
};