const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

class MemoryManager {
    constructor() {
        this.dbPath = path.join(process.cwd(), 'data', 'memory.db');
        this.recentMemory = new Map();
        this.maxRecent = 50;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, async (err) => {
                if (err) {
                    logger.error(`DB Connection failed: ${err.message}`);
                    return reject(err);
                }

                try {
                    await this.createTables();
                    logger.info('Memory database loaded.');
                    resolve();
                } catch (tableErr) {
                    reject(tableErr);
                }
            });
        });
    }

    async createTables() {
        const schemas = [
            `CREATE TABLE IF NOT EXISTS global_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT DEFAULT 'default',
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(character_id, content)
            )`,
            `CREATE TABLE IF NOT EXISTS user_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT DEFAULT 'default',
                user_id TEXT,
                key TEXT,
                value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(character_id, user_id, key)
            )`,
            `CREATE TABLE IF NOT EXISTS facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT DEFAULT 'default',
                topic TEXT,
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(character_id, topic)
            )`,
            `CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT DEFAULT 'default',
                user_id_1 TEXT,
                user_id_2 TEXT,
                relationship_type TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(character_id, user_id_1, user_id_2, relationship_type)
            )`
        ];

        for (const schema of schemas) {
            await this.run(schema);
        }

        // Migrations (ignoring errors if columns exist)
        const migrations = [
            "ALTER TABLE global_memory ADD COLUMN character_id TEXT DEFAULT 'default'",
            "ALTER TABLE user_memory ADD COLUMN character_id TEXT DEFAULT 'default'",
            "ALTER TABLE facts ADD COLUMN character_id TEXT DEFAULT 'default'"
        ];

        for (const migration of migrations) {
            try {
                await this.run(migration);
            } catch (e) { /* ignore */ }
        }
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // --- In-Memory Operations ---

    addRecent(channelId, message) {
        if (!this.recentMemory.has(channelId)) {
            this.recentMemory.set(channelId, []);
        }
        const history = this.recentMemory.get(channelId);
        history.push({ ...message, timestamp: message.timestamp || Date.now() });

        if (history.length > this.maxRecent) {
            history.shift();
        }
    }

    getRecent(channelId) {
        return this.recentMemory.get(channelId) || [];
    }

    getRecentAcrossChannels(limit = 10) {
        const allMessages = [];
        for (const [channelId, messages] of this.recentMemory.entries()) {
            allMessages.push(...messages.map(msg => ({ ...msg, channelId })));
        }
        return allMessages.slice(-limit);
    }

    getMessagesSince(minutesAgo) {
        const cutoffTime = Date.now() - (minutesAgo * 60 * 1000);
        const allMessages = [];

        for (const [channelId, messages] of this.recentMemory.entries()) {
            const recentMsgs = messages.filter(msg => msg.timestamp >= cutoffTime);
            allMessages.push(...recentMsgs.map(msg => ({ ...msg, channelId })));
        }

        return allMessages.sort((a, b) => a.timestamp - b.timestamp);
    }

    // --- DB Operations ---

    async addGlobal(content, characterId = 'default') {
        try {
            await this.run('INSERT OR IGNORE INTO global_memory (content, character_id) VALUES (?, ?)', [content, characterId]);
        } catch (err) {
            logger.error(`Global memory error: ${err.message}`);
        }
    }

    getGlobal(characterId = 'default', callback) {
        this.all('SELECT content FROM global_memory WHERE character_id = ? ORDER BY created_at DESC LIMIT 50', [characterId])
            .then(rows => callback(null, rows))
            .catch(err => {
                logger.error(`Get global memory error: ${err.message}`);
                callback(err, []);
            });
    }

    setUserMemory(userId, key, value, characterId = 'default') {
        this.run('INSERT OR REPLACE INTO user_memory (user_id, key, value, character_id) VALUES (?, ?, ?, ?)',
            [userId, key, value, characterId])
            .catch(err => logger.error(`Set user memory error: ${err.message}`));
    }

    getUserMemory(userId, characterId = 'default', callback) {
        this.all('SELECT key, value FROM user_memory WHERE user_id = ? AND character_id = ?', [userId, characterId])
            .then(rows => callback(null, rows))
            .catch(err => {
                logger.error(`Get user memory error: ${err.message}`);
                callback(err, []);
            });
    }

    getAllFacts(characterId = 'default', callback) {
        this.all('SELECT topic, content FROM facts WHERE character_id = ? LIMIT 20', [characterId])
            .then(rows => callback(null, rows))
            .catch(err => {
                logger.error(`Get facts error: ${err.message}`);
                callback(err, []);
            });
    }

    addRelationship(userId1, userId2, relationshipType, description, characterId = 'default') {
        this.run('INSERT OR REPLACE INTO relationships (user_id_1, user_id_2, relationship_type, description, character_id) VALUES (?, ?, ?, ?, ?)',
            [userId1, userId2, relationshipType, description, characterId])
            .catch(err => logger.error(`Add relationship error: ${err.message}`));
    }

    getRelationships(userId, characterId = 'default', callback) {
        this.all('SELECT user_id_1, user_id_2, relationship_type, description FROM relationships WHERE (user_id_1 = ? OR user_id_2 = ?) AND character_id = ?',
            [userId, userId, characterId])
            .then(rows => callback(null, rows))
            .catch(err => {
                logger.error(`Get relationships error: ${err.message}`);
                callback(err, []);
            });
    }
}

module.exports = new MemoryManager();
