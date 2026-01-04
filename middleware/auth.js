const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '-refresh';
const ADMIN_JWT_SECRET = JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '30d'; // 30 gün - mobil uygulama için uzun süre
const REFRESH_TOKEN_EXPIRY = '90d'; // 90 gün
const ADMIN_TOKEN_EXPIRY = '12h';

// Token generation functions
function generateAccessToken(user) {
    return jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
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

function generateAdminToken(admin) {
    return jwt.sign(
        { adminId: admin.id, email: admin.email, role: admin.role },
        ADMIN_JWT_SECRET,
        { expiresIn: ADMIN_TOKEN_EXPIRY }
    );
}

// Legacy admin middleware (x-admin-token header) - DEPRECATED
function requireAdminLegacy(req, res, next) {
    const token = req.headers["x-admin-token"];
    if (!token || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

// New JWT-based admin middleware (Authorization: Bearer <token>)
function requireAdminJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    // Also support legacy x-admin-token during transition
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

// Middleware to extract user from JWT token
async function getUserFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (error) {
        return null;
    }
}

// Middleware to require authenticated user (not necessarily admin)
function requireUser(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: "Unauthorized: Token expired" });
        }
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}

// Alias
const requireAdmin = requireAdminJWT;

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateAdminToken,
    requireAdmin,
    requireAdminLegacy,
    requireAdminJWT,
    requireUser,
    getUserFromToken,
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    ADMIN_JWT_SECRET,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY,
    ADMIN_TOKEN_EXPIRY,
};
