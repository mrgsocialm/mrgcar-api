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

// Security & validation modules (hard-fail if missing)
const helmet = require('helmet');
const { publicLimiter, adminLimiter, authLimiter } = require('./middleware/rateLimit');

const { validate, createCarSchema, updateCarSchema, listCarsQuerySchema } = require('./validation/cars');
const apiResponse = require('./utils/response');

const { createForumPostSchema } = require('./validation/forum');
const { createNewsSchema, updateNewsSchema } = require('./validation/news');
const { createSliderSchema, updateSliderSchema } = require('./validation/sliders');
const { sendNotificationSchema } = require('./validation/notifications');
const { presignUploadSchema, deleteUploadSchema } = require('./validation/uploads');
const { createReviewSchema, updateReviewSchema } = require('./validation/reviews');
const { updateUserSchema, tempBanSchema, restrictSchema } = require('./validation/users');
const logger = require('./services/logger');

// Import auth functions from centralized middleware
const {
    generateAccessToken,
    generateRefreshToken,
    generateAdminToken,
    requireAdmin,
    JWT_SECRET: AUTH_JWT_SECRET,
    JWT_REFRESH_SECRET,
    ADMIN_JWT_SECRET,
} = require('./middleware/auth');

const app = express();

// Trust proxy FIRST
app.set('trust proxy', 1);

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
    logger.error('❌ FATAL: JWT_SECRET environment variable is required!');
    process.exit(1);
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
            origin.includes('172.')) {
            return callback(null, true);
        }

        // Check against allowed origins
        const isAllowed = allowedOrigins.some(ao => origin === ao || origin.startsWith(ao));
        if (isAllowed || origin.endsWith('.mrgcar.com') || origin === 'https://mrgcar.com') {
            return callback(null, true);
        }

        logger.warn(`CORS blocked for origin: ${origin}`);
        callback(new Error('CORS policy violation'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200,
    maxAge: 86400, // 24 hours
};

// CORS middleware
app.use(cors(corsOptions));

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginEmbedderPolicy: false, // Disable for API
}));

app.use(express.json({ limit: '10mb' }));

// Cookie parser — httpOnly cookie auth support
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Request logging middleware (after JSON parsing, before routes)
const requestLogger = require('./middleware/requestLogger');
app.use(requestLogger);

// Activity logger middleware (adds req.logActivity to admin routes)
const { activityLoggerMiddleware } = require('./middleware/activityLogger');
app.use(activityLoggerMiddleware);

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

// Swagger API Documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
app.use('/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'MRGCar API Docs',
}));

// Serve raw OpenAPI spec as JSON
app.get('/v1/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Import and create all routers
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

// Email service for password reset
let emailService;
try {
    emailService = require('./services/email');
} catch (e) {
    logger.warn('⚠️  Email service not available');
    emailService = {
        sendPasswordResetEmail: async () => ({ success: false, error: 'Email service not configured' })
    };
}

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

const createAdminRouter = require('./routes/admin');
const adminRouter = createAdminRouter({
    bcrypt,
    generateAdminToken,
    requireAdmin,
});

const createNewsRouter = require('./routes/news');
const newsRouter = createNewsRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createNewsSchema,
    updateNewsSchema,
    apiResponse,
});

const createForumRouter = require('./routes/forum');
const forumRouter = createForumRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createForumPostSchema,
    apiResponse,
});

const createSlidersRouter = require('./routes/sliders');
const slidersRouter = createSlidersRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createSliderSchema,
    updateSliderSchema,
    apiResponse,
});

const createReviewsRouter = require('./routes/reviews');
const reviewsRouter = createReviewsRouter({
    publicLimiter,
    adminLimiter,
    validate,
    createReviewSchema,
    updateReviewSchema,
    apiResponse,
});

const createNotificationsRouter = require('./routes/notifications');
const notificationsRouter = createNotificationsRouter({
    publicLimiter,
    adminLimiter,
    validate,
    sendNotificationSchema,
    apiResponse,
});

const createUsersRouter = require('./routes/users');
const usersRouter = createUsersRouter({
    publicLimiter,
    adminLimiter,
    validate,
    updateUserSchema,
    tempBanSchema,
    restrictSchema,
    apiResponse,
});

const createUploadsRouter = require('./routes/uploads');
const uploadsRouter = createUploadsRouter({
    adminLimiter,
    publicLimiter,
    validate,
    presignUploadSchema,
    deleteUploadSchema,
    apiResponse,
});

// ═══════════════════════════════════════════════
// API v1 Router — all routes under /v1/ prefix
// ═══════════════════════════════════════════════
const v1Router = express.Router();
v1Router.use('/cars', carsRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/admin', adminRouter);
v1Router.use('/news', newsRouter);
v1Router.use('/forum', forumRouter);
v1Router.use('/sliders', slidersRouter);
v1Router.use('/reviews', reviewsRouter);
v1Router.use('/notifications', notificationsRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/uploads', uploadsRouter);

app.use('/v1', v1Router);

// Also mount at root level for backward compatibility
// (Flutter app v1.0.5 on Play Store uses URLs without /v1 prefix)
app.use('/cars', carsRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/news', newsRouter);
app.use('/forum', forumRouter);
app.use('/sliders', slidersRouter);
app.use('/reviews', reviewsRouter);
app.use('/notifications', notificationsRouter);
app.use('/users', usersRouter);
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
    JWT_SECRET: JWT_SECRET || 'test-secret',
    JWT_REFRESH_SECRET,
    ADMIN_JWT_SECRET,
};
