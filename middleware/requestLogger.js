/**
 * Request Logging Middleware
 * Uses Winston logger for structured request logging
 */

const crypto = require('crypto');
const logger = require('../services/logger');

/**
 * Generate or use existing request ID
 */
function getRequestId(req) {
    const existingId = req.headers['x-request-id'];
    if (existingId) return existingId;
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
    const requestId = getRequestId(req);
    req.requestId = requestId;

    // Set request-id in response header
    res.setHeader('X-Request-ID', requestId);

    const startTime = Date.now();

    logger.http(`REQ ${req.method} ${req.path}`, {
        requestId,
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        ip: req.ip || req.connection?.remoteAddress,
    });

    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const meta = {
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
        };

        if (res.statusCode >= 500) {
            logger.error(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, meta);
        } else if (res.statusCode >= 400) {
            logger.warn(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, meta);
        } else {
            logger.http(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, meta);
        }

        // Set request-id in Sentry context if available
        if (typeof Sentry !== 'undefined' && Sentry.setTag) {
            Sentry.setTag('request_id', requestId);
            Sentry.setContext('request', meta);
        }
    });

    next();
}

module.exports = requestLogger;
