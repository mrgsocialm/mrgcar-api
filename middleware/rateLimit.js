/**
 * Rate Limiting Configuration
 * Different limits for public and admin endpoints
 * 
 * Note: express-rate-limit v7+ handles req.ip by default with proper IPv6 support
 * No custom keyGenerator needed - the default is secure and handles IPv6 correctly
 */

const rateLimit = require('express-rate-limit');

// Standard response for rate limit exceeded
const rateLimitResponse = {
    ok: false,
    error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
    },
};

// Public endpoints (GET) - 120 req/min/ip
const publicLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitResponse,
    // Uses default keyGenerator which properly handles IPv6
});

// Admin endpoints (POST/PUT/DELETE) - 60 req/min/ip
const adminLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitResponse,
    // Uses default keyGenerator which properly handles IPv6
});

// Auth endpoints (login) - 10 req/min/ip (prevent brute force)
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: {
            code: 'AUTH_RATE_LIMIT',
            message: 'Çok fazla giriş denemesi. 1 dakika bekleyin.',
        },
    },
    // Uses default keyGenerator which properly handles IPv6
});

module.exports = {
    publicLimiter,
    adminLimiter,
    authLimiter,
};
