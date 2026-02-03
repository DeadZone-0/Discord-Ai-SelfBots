const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'bot.log');

function getTimestamp() {
    return new Date().toISOString();
}

function log(level, message) {
    const logMessage = `[${getTimestamp()}] [${level}] ${message}\n`;

    // Write to console only for important levels
    if (level !== 'DEBUG') {
        console.log(logMessage.trim());
    }

    // Append to log file
    fs.appendFileSync(logFile, logMessage);
}

module.exports = {
    info: (msg) => log('INFO', msg),
    warn: (msg) => log('WARN', msg),
    error: (msg) => log('ERROR', msg),
    debug: (msg) => log('DEBUG', msg)
};
