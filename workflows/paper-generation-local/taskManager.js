// common/taskManager.js
const fs = require('fs').promises;
const path = require('path');
const TASKS_FILE = path.join(__dirname, './tasks.json');

async function readTasks() {
    try {
        const data = await fs.readFile(TASKS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeTasks(tasks) {
    await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

module.exports = {
    readTasks,
    writeTasks
};