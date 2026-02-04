// StorageManager.js - Browser-compatible version using IndexedDB
import { get, set } from 'idb-keyval';

export class StorageManager {
    constructor() {
        this.historyKey = 'inklogic_history';
    }

    // LocalStorage wrappers
    get(key, defaultValue = null) {
        const val = localStorage.getItem(key);
        return val ? val : defaultValue;
    }

    setValue(key, value) {
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

    // IndexedDB for History (larger data)
    async loadHistory() {
        try {
            const history = await get(this.historyKey);
            return history || [];
        } catch (e) {
            console.error("Failed to load history:", e);
            return [];
        }
    }

    async saveHistory(history) {
        try {
            await set(this.historyKey, history);
        } catch (e) {
            console.error("Failed to save history:", e);
        }
    }
}
