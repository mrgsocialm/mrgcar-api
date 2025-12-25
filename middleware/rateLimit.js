/**
 * Rate Limiting Configuration
 * Different limits for public and admin endpoints
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
    keyGenerator: (req) => req.ip,
});

// Admin endpoints (POST/PUT/DELETE) - 60 req/min/ip
const adminLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitResponse,
    keyGenerator: (req) => req.ip,
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
    keyGenerator: (req) => req.ip,
});

module.exports = {
    publicLimiter,
    adminLimiter,
    authLimiter,
};
