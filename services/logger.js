/**
 * Winston Logger Service
 * Structured logging for production and development
 * 
 * Usage:
 *   const logger = require('./services/logger');
 *   logger.info('Message', { key: 'value' });
 *   logger.error('Error occurred', { error: err.message, stack: err.stack });
 *   logger.warn('Warning message');
 *   logger.http('Request log', { method: 'GET', path: '/v1/cars' });
 *   logger.debug('Debug info');
 */

const winston = require('winston');

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Custom dev format: colorized, human-readable
const devFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    printf(({ timestamp, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        if (stack) return `${timestamp} ${level}: ${message}\n${stack}`;
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })
);

// JSON format for production (log aggregation / Sentry friendly)
const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4,
    },
    format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    defaultMeta: { service: 'mrgcar-api' },
    transports: [
        new winston.transports.Console({
            // Suppress logs during test unless LOG_LEVEL is explicitly set
            silent: process.env.NODE_ENV === 'test' && !process.env.LOG_LEVEL,
        }),
    ],
});

// Add custom colors
winston.addColors({
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    http: 'magenta',
    debug: 'gray',
});

module.exports = logger;
