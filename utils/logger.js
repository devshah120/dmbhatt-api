const fs = require('fs');
const path = require('path');

const LOGS_ROOT = path.join(__dirname, '../logs');

/**
 * Mask a secret so it never lands in a log file in plain text.
 * Keeps the first few characters for correlation, hides the rest.
 */
const mask = (value, visible = 4) => {
    if (value === undefined || value === null) return null;
    const str = String(value);
    if (str.length <= visible) return '***';
    return `${str.substring(0, visible)}***`;
};

/**
 * Append a structured JSON log entry to logs/<category>/<category>_<YYYY-MM-DD>.log
 *
 * @param {string} category  e.g. 'payment', 'referral', 'apple-membership'
 * @param {object} data      the payload to serialize
 */
const writeLog = (category, data) => {
    try {
        const dir = path.join(LOGS_ROOT, category);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const filePath = path.join(dir, `${category}_${dateStr}.log`);

        const entry = `[${now.toISOString()}] ${JSON.stringify(data)}\n`;
        fs.appendFileSync(filePath, entry, 'utf8');
    } catch (err) {
        // Logging must never break the request flow.
        console.error(`[LOGGER] Failed to write ${category} log:`, err.message);
    }
};

/**
 * Create a per-request logger that accumulates steps and flushes to a file.
 * Mirrors the structured logging already used for the Apple IAP flows so
 * Razorpay / referral flows produce the same log shape.
 *
 * Usage:
 *   const log = createRequestLogger('payment', { endpoint, req });
 *   log.step('Verify signature', { success: true });
 *   log.finish('SUCCESS');            // or log.fail('EXCEPTION', error)
 */
const createRequestLogger = (category, { endpoint, req, meta = {} } = {}) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        endpoint: endpoint || `${req?.method || ''} ${req?.originalUrl || ''}`.trim(),
        userId: req?.user?.id || req?.user?._id || null,
        ip: req?.ip || req?.headers?.['x-forwarded-for'] || null,
        ...meta,
        steps: []
    };

    const flush = () => {
        console.log(`[${category.toUpperCase()}_LOG]`, JSON.stringify(logEntry, null, 2));
        writeLog(category, logEntry);
    };

    return {
        entry: logEntry,
        set(key, value) {
            logEntry[key] = value;
            return this;
        },
        step(name, details = {}) {
            logEntry.steps.push({ step: name, ...details });
            return this;
        },
        finish(status = 'SUCCESS') {
            logEntry.status = status;
            flush();
        },
        fail(status, error) {
            logEntry.status = status;
            if (error) {
                logEntry.error = { message: error.message, stack: error.stack };
            }
            flush();
        },
        flush
    };
};

module.exports = { writeLog, createRequestLogger, mask };
