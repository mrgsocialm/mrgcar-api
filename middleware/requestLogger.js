/**
 * Request Logging Middleware
 * Logs all requests with request-id, method, path, status, and duration
 */

const crypto = require('crypto');

/**
 * Generate or use existing request ID
 */
function getRequestId(req) {
    // Use existing x-request-id header if present, otherwise generate one
    const existingId = req.headers['x-request-id'];
    if (existingId) {
        return existingId;
    }
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
    
    // Start time for duration calculation
    const startTime = Date.now();
    
    // Log request start
    const logStart = {
        requestId,
        method: req.method,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
    };
    
    console.log(`[${new Date().toISOString()}] REQ ${requestId} ${req.method} ${req.path}`, 
        logStart.query ? `query=${JSON.stringify(logStart.query)}` : '');
    
    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logEnd = {
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
        };
        
        // Log level based on status code
        const logLevel = res.statusCode >= 500 ? 'ERROR' : 
                        res.statusCode >= 400 ? 'WARN' : 'INFO';
        
        console.log(`[${new Date().toISOString()}] ${logLevel} ${requestId} ${req.method} ${req.path} ${res.statusCode} ${logEnd.duration}`);
        
        // Set request-id in Sentry context if available
        if (typeof Sentry !== 'undefined' && Sentry.setTag) {
            Sentry.setTag('request_id', requestId);
            Sentry.setContext('request', {
                method: req.method,
                path: req.path,
                status: res.statusCode,
                duration: `${duration}ms`,
            });
        }
    });
    
    next();
}

module.exports = requestLogger;

