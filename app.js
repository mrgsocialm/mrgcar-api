// App configuration - exports express app for testing
// Server listen is in index.js

// Sentry must be initialized first before any other imports
require('./instrument');
const Sentry = require("@sentry/node");

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require("./db");
const fcmService = require('./services/fcm');

// Security & validation modules
let helmet, publicLimiter, adminLimiter, authLimiter, validate, createCarSchema, updateCarSchema, listCarsQuerySchema;
let createForumPostSchema;
let createNewsSchema, updateNewsSchema;
let createSliderSchema, updateSliderSchema;
let sendNotificationSchema;
let presignUploadSchema, deleteUploadSchema;
let apiResponse;

try {
    helmet = require('helmet');
    const rateLimitModule = require('./middleware/rateLimit');
    publicLimiter = rateLimitModule.publicLimiter;
    adminLimiter = rateLimitModule.adminLimiter;
    authLimiter = rateLimitModule.authLimiter;

    const validationModule = require('./validation/cars');
    validate = validationModule.validate;
    createCarSchema = validationModule.createCarSchema;
    updateCarSchema = validationModule.updateCarSchema;
    listCarsQuerySchema = validationModule.listCarsQuerySchema;

    apiResponse = require('./utils/response');

    const forumValidationModule = require('./validation/forum');
    createForumPostSchema = forumValidationModule.createForumPostSchema;

    const newsValidationModule = require('./validation/news');
    createNewsSchema = newsValidationModule.createNewsSchema;
    updateNewsSchema = newsValidationModule.updateNewsSchema;

    const slidersValidationModule = require('./validation/sliders');
    createSliderSchema = slidersValidationModule.createSliderSchema;
    updateSliderSchema = slidersValidationModule.updateSliderSchema;

    const notificationsValidationModule = require('./validation/notifications');
    sendNotificationSchema = notificationsValidationModule.sendNotificationSchema;

    const uploadsValidationModule = require('./validation/uploads');
    presignUploadSchema = uploadsValidationModule.presignUploadSchema;
    deleteUploadSchema = uploadsValidationModule.deleteUploadSchema;
} catch (e) {
    console.warn('⚠️  Some security modules not installed. Run: npm install zod helmet express-rate-limit');
    helmet = () => (req, res, next) => next();
    publicLimiter = (req, res, next) => next();
    adminLimiter = (req, res, next) => next();
    authLimiter = (req, res, next) => next();
    validate = () => (req, res, next) => { req.validatedBody = req.body; req.validatedQuery = req.query; next(); };
    createCarSchema = {};
    updateCarSchema = {};
    listCarsQuerySchema = {};
    apiResponse = {
        success: (res, data, status = 200) => res.status(status).json({ ok: true, data }),
        successWithPagination: (res, data, pagination) => res.status(200).json({ ok: true, data, pagination }),
        errors: {
            notFound: (res, resource) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `${resource} bulunamadı` } }),
            badRequest: (res, message) => res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message } }),
            serverError: (res, message) => res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message } }),
            unauthorized: (res, message) => res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message } }),
            forbidden: (res, message) => res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message } }),
        }
    };
    createForumPostSchema = {};
    createNewsSchema = {};
    updateNewsSchema = {};
    createSliderSchema = {};
    updateSliderSchema = {};
    sendNotificationSchema = {};
    presignUploadSchema = {};
    deleteUploadSchema = {};
}

const app = express();

// Trust proxy FIRST
app.set('trust proxy', 1);

// Handle ALL preflight requests IMMEDIATELY - before ANY other middleware
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;
        // Allow all mrgcar.com subdomains, localhost, and common dev origins
        const isAllowed = !origin ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.includes('10.0.2.2') ||
            origin.includes('192.168.') ||
            origin.includes('172.') ||
            origin.endsWith('.mrgcar.com') ||
            origin === 'https://mrgcar.com' ||
            origin === 'https://admin.mrgcar.com' ||
            origin === 'https://api.mrgcar.com';

        if (isAllowed) {
            res.header('Access-Control-Allow-Origin', origin || '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-admin-token, X-Requested-With');
            res.header('Access-Control-Allow-Credentials', 'true');
            res.header('Access-Control-Max-Age', '86400');
            return res.sendStatus(200);
        }
        return res.sendStatus(403);
    }
    next();
});

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
    console.error('❌ FATAL: JWT_SECRET environment variable is required!');
    process.exit(1);
}
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (JWT_SECRET || 'test') + '-refresh';
const ACCESS_TOKEN_EXPIRY = '30d'; // 30 gün - mobil uygulama için uzun süre
const REFRESH_TOKEN_EXPIRY = '90d'; // 90 gün

// Token generation functions
function generateAccessToken(user) {
    return jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET || 'test-secret',
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { userId: user.id, email: user.email },
        JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    );
}

// CORS configuration
const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'https://admin.mrgcar.com',
    'http://admin.mrgcar.com',
    'https://api.mrgcar.com',
    'http://api.mrgcar.com',
    'https://mrgcar.com',
    'https://www.mrgcar.com',
    'http://mrgcar.com',
    'http://www.mrgcar.com',
];

// CORS configuration
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, etc.)
        if (!origin) {
            return callback(null, true);
        }

        // Allow localhost, 127.0.0.1, and Android emulator (10.0.2.2)
        if (origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.includes('10.0.2.2') ||
            origin.includes('192.168.') ||
            origin.includes('172.') ||
            origin.includes('192.168.')) {
            return callback(null, true);
        }

        // Check against allowed origins
        const isAllowed = allowedOrigins.some(ao => origin === ao || origin.startsWith(ao));
        if (isAllowed || origin.endsWith('.mrgcar.com') || origin === 'https://mrgcar.com') {
            return callback(null, true);
        }

        console.warn(`CORS blocked for origin: ${origin}`);
        callback(new Error('CORS policy violation'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-admin-token', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 hours
};

// CORS middleware - handles actual requests (preflight already handled above)
app.use(cors(corsOptions));

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginEmbedderPolicy: false, // Disable for API
}));

app.use(express.json({ limit: '10mb' }));

// Request logging middleware (after JSON parsing, before routes)
const requestLogger = require('./middleware/requestLogger');
app.use(requestLogger);

// Admin JWT Secret
const ADMIN_JWT_SECRET = JWT_SECRET || 'test-secret';
const ADMIN_TOKEN_EXPIRY = '12h';

function generateAdminToken(admin) {
    return jwt.sign(
        { adminId: admin.id, email: admin.email, role: admin.role },
        ADMIN_JWT_SECRET,
        { expiresIn: ADMIN_TOKEN_EXPIRY }
    );
}

function requireAdminLegacy(req, res, next) {
    const token = req.headers["x-admin-token"];
    if (!token || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

function requireAdminJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    const legacyToken = req.headers["x-admin-token"];
    if (legacyToken && legacyToken === process.env.ADMIN_TOKEN) {
        return next();
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: "Forbidden: Admin role required" });
        }
        req.admin = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: "Unauthorized: Token expired" });
        }
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}

const requireAdmin = requireAdminJWT;

// Health check
app.get('/', async (req, res) => {
    const health = {
        status: 'ok',
        message: 'MRGCAR API ayakta',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    };

    // Add version/commit if available
    if (process.env.GIT_SHA) {
        health.version = process.env.GIT_SHA;
    } else if (process.env.APP_VERSION) {
        health.version = process.env.APP_VERSION;
    }

    // Check database connection
    try {
        await pool.query('SELECT 1');
        health.db = 'connected';
    } catch (err) {
        health.db = 'error';
        health.status = 'degraded';
        return res.status(503).json(health);
    }

    res.json(health);
});

// Import and mount cars router
const createCarsRouter = require('./routes/cars');
const carsRouter = createCarsRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createCarSchema,
    updateCarSchema,
    listCarsQuerySchema,
    apiResponse,
});
app.use('/cars', carsRouter);

// Email service for password reset
let emailService;
try {
    emailService = require('./services/email');
} catch (e) {
    console.warn('⚠️  Email service not available');
    emailService = {
        sendPasswordResetEmail: async () => ({ success: false, error: 'Email service not configured' })
    };
}

// Import and mount auth router
const createAuthRouter = require('./routes/auth');
const authRouter = createAuthRouter({
    authLimiter,
    bcrypt,
    jwt,
    JWT_SECRET: JWT_SECRET || 'test-secret',
    JWT_REFRESH_SECRET,
    generateAccessToken,
    generateRefreshToken,
    emailService,
});
app.use('/auth', authRouter);

// Import and mount admin router
const createAdminRouter = require('./routes/admin');
const adminRouter = createAdminRouter({
    bcrypt,
    generateAdminToken,
    requireAdmin,
});
app.use('/admin', adminRouter);

// Import and mount news router
const createNewsRouter = require('./routes/news');
const newsRouter = createNewsRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createNewsSchema,
    updateNewsSchema,
    apiResponse,
});
app.use('/news', newsRouter);

// Import and mount forum router
const createForumRouter = require('./routes/forum');
const forumRouter = createForumRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createForumPostSchema,
    apiResponse,
});
app.use('/forum', forumRouter);

// Import and mount sliders router
const createSlidersRouter = require('./routes/sliders');
const slidersRouter = createSlidersRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createSliderSchema,
    updateSliderSchema,
    apiResponse,
});
app.use('/sliders', slidersRouter);

// Import and mount notifications router
const createNotificationsRouter = require('./routes/notifications');
const notificationsRouter = createNotificationsRouter({
    publicLimiter,
    adminLimiter,
    validate,
    sendNotificationSchema,
    apiResponse,
});
app.use('/notifications', notificationsRouter);

// Users router
const createUsersRouter = require('./routes/users');
const usersRouter = createUsersRouter({
    publicLimiter,
    adminLimiter,
    apiResponse,
});
app.use('/users', usersRouter);

// Import and mount uploads router
const createUploadsRouter = require('./routes/uploads');
const uploadsRouter = createUploadsRouter({
    adminLimiter,
    publicLimiter,
    validate,
    presignUploadSchema,
    deleteUploadSchema,
    apiResponse,
});
app.use('/uploads', uploadsRouter);

// Export app and dependencies for other modules and tests
module.exports = {
    app,
    pool,
    bcrypt,
    jwt,
    fcmService,
    publicLimiter,
    adminLimiter,
    authLimiter,
    validate,
    apiResponse,
    createForumPostSchema,
    generateAccessToken,
    generateRefreshToken,
    generateAdminToken,
    requireAdmin,
    requireAdminLegacy,
    JWT_SECRET: JWT_SECRET || 'test-secret',
    JWT_REFRESH_SECRET,
    ADMIN_JWT_SECRET,
};

