// StorageManager.js - Handles persistence
const fs = require('fs');
const path = require('path');

class StorageManager {
    constructor(basePath) {
        this.basePath = basePath;
    }

    // LocalStorage wrappers
    get(key, defaultValue = null) {
        const val = localStorage.getItem(key);
        return val ? val : defaultValue;
    }

    set(key, value) {
        localStorage.setItem(key, value);
    }

    getJSON(key, defaultValue = null) {
        const val = localStorage.getItem(key);
        if (val) {
            try {
                return JSON.parse(val);
            } catch (e) {
                console.error("Storage parse error:", e);
                return defaultValue;
            }
        }
        return defaultValue;
    }

    setJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // File System (History)
    loadHistory() {
        const historyFile = path.join(this.basePath, 'history.json');
        if (fs.existsSync(historyFile)) {
            try {
                return JSON.parse(fs.readFileSync(historyFile));
            } catch (e) {
                console.error("Failed to load server history:", e);
            }
        }
        return [];
    }

    saveHistory(history) {
        const historyFile = path.join(this.basePath, 'history.json');
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    }
}

module.exports = StorageManager;
