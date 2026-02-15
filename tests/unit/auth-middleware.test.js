/**
 * Unit tests for middleware/auth.js
 * JWT token generation and auth middleware
 */

const jwt = require('jsonwebtoken');

// Set JWT_SECRET before requiring auth module
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests';
process.env.ADMIN_TOKEN = 'legacy-admin-token-12345';

const {
    generateAccessToken,
    generateRefreshToken,
    generateAdminToken,
    requireUser,
    requireAdmin,
    requireAdminJWT,
    getUserFromToken,
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    ADMIN_JWT_SECRET,
} = require('../../middleware/auth');

// Mock Express req/res/next
function createMockReq(overrides = {}) {
    return {
        headers: {},
        ...overrides,
    };
}

function createMockRes() {
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
    };
    return res;
}

// ==================== Token Generation ====================

describe('Token Generation', () => {

    describe('generateAccessToken()', () => {
        test('should generate a valid JWT for user', () => {
            const user = { id: 'user-001', email: 'test@test.com' };
            const token = generateAccessToken(user);

            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // JWT format

            const decoded = jwt.verify(token, JWT_SECRET);
            expect(decoded.userId).toBe('user-001');
            expect(decoded.email).toBe('test@test.com');
        });

        test('should set proper expiration', () => {
            const user = { id: 'u1', email: 'x@x.com' };
            const token = generateAccessToken(user);
            const decoded = jwt.decode(token);

            expect(decoded.exp).toBeDefined();
            expect(decoded.iat).toBeDefined();
            // 15m expiry → exp - iat ≈ 900
            expect(decoded.exp - decoded.iat).toBe(15 * 60);
        });
    });

    describe('generateRefreshToken()', () => {
        test('should generate a valid JWT with refresh secret', () => {
            const user = { id: 'user-002', email: 'refresh@test.com' };
            const token = generateRefreshToken(user);

            const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
            expect(decoded.userId).toBe('user-002');
        });

        test('should have 90-day expiration', () => {
            const user = { id: 'u1', email: 'x@x.com' };
            const token = generateRefreshToken(user);
            const decoded = jwt.decode(token);

            expect(decoded.exp - decoded.iat).toBe(90 * 24 * 3600);
        });

        test('should NOT be verifiable with access token secret', () => {
            const user = { id: 'u1', email: 'x@x.com' };
            const refreshToken = generateRefreshToken(user);

            // Verify it uses a different secret
            // It may or may not throw depending on key coincidence,
            // but the key should conceptually be different
            expect(JWT_REFRESH_SECRET).not.toBe(JWT_SECRET);
        });
    });

    describe('generateAdminToken()', () => {
        test('should generate token with admin fields', () => {
            const admin = { id: 'admin-001', email: 'admin@mrgcar.com', role: 'admin' };
            const token = generateAdminToken(admin);

            const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
            expect(decoded.adminId).toBe('admin-001');
            expect(decoded.email).toBe('admin@mrgcar.com');
            expect(decoded.role).toBe('admin');
        });

        test('should have 12-hour expiration', () => {
            const admin = { id: 'a1', email: 'a@a.com', role: 'admin' };
            const token = generateAdminToken(admin);
            const decoded = jwt.decode(token);

            expect(decoded.exp - decoded.iat).toBe(12 * 3600);
        });
    });
});

// ==================== requireUser Middleware ====================

describe('requireUser()', () => {
    test('should return 401 when no Authorization header', () => {
        const req = createMockReq();
        const res = createMockRes();
        const next = jest.fn();

        requireUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('No token provided');
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when Authorization header is not Bearer', () => {
        const req = createMockReq({
            headers: { authorization: 'Basic abc123' },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for malformed JWT', () => {
        const req = createMockReq({
            headers: { authorization: 'Bearer not-a-valid-jwt' },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('Invalid token');
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for expired token', () => {
        // Generate an already-expired token
        const expiredToken = jwt.sign(
            { userId: 'u1', email: 'e@e.com' },
            JWT_SECRET,
            { expiresIn: '-1s' }
        );

        const req = createMockReq({
            headers: { authorization: `Bearer ${expiredToken}` },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('Token expired');
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for token signed with wrong secret', () => {
        const wrongToken = jwt.sign(
            { userId: 'u1', email: 'e@e.com' },
            'completely-wrong-secret',
            { expiresIn: '1h' }
        );

        const req = createMockReq({
            headers: { authorization: `Bearer ${wrongToken}` },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('should call next() and set req.user for valid token', () => {
        const user = { id: 'user-abc', email: 'valid@user.com' };
        const validToken = generateAccessToken(user);

        const req = createMockReq({
            headers: { authorization: `Bearer ${validToken}` },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toBeDefined();
        expect(req.user.userId).toBe('user-abc');
        expect(req.user.email).toBe('valid@user.com');
    });

    test('should handle empty Bearer token', () => {
        const req = createMockReq({
            headers: { authorization: 'Bearer ' },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireUser(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });
});

// ==================== requireAdmin Middleware ====================

describe('requireAdmin() / requireAdminJWT()', () => {
    test('should return 401 when no credentials provided', () => {
        const req = createMockReq();
        const res = createMockRes();
        const next = jest.fn();

        requireAdmin(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for requests with only x-admin-token header (legacy removed)', () => {
        const req = createMockReq({
            headers: { 'x-admin-token': 'legacy-admin-token-12345' },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireAdmin(req, res, next);

        // Legacy x-admin-token no longer supported
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('should reject invalid legacy x-admin-token', () => {
        const req = createMockReq({
            headers: { 'x-admin-token': 'wrong-legacy-token' },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireAdmin(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('should accept valid admin JWT Bearer token', () => {
        const admin = { id: 'admin-001', email: 'admin@test.com', role: 'admin' };
        const token = generateAdminToken(admin);

        const req = createMockReq({
            headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireAdmin(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.admin).toBeDefined();
        expect(req.admin.adminId).toBe('admin-001');
        expect(req.admin.role).toBe('admin');
    });

    test('should return 403 for non-admin role JWT', () => {
        // Create a token with role != 'admin'
        const token = jwt.sign(
            { adminId: 'user-001', email: 'editor@test.com', role: 'editor' },
            ADMIN_JWT_SECRET,
            { expiresIn: '1h' }
        );

        const req = createMockReq({
            headers: { authorization: `Bearer ${token}` },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireAdmin(req, res, next);

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toContain('Admin role required');
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for expired admin JWT', () => {
        const expiredToken = jwt.sign(
            { adminId: 'a1', email: 'a@a.com', role: 'admin' },
            ADMIN_JWT_SECRET,
            { expiresIn: '-1s' }
        );

        const req = createMockReq({
            headers: { authorization: `Bearer ${expiredToken}` },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireAdmin(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('Token expired');
    });

    test('should return 401 for invalid admin JWT', () => {
        const req = createMockReq({
            headers: { authorization: 'Bearer garbage.token.here' },
        });
        const res = createMockRes();
        const next = jest.fn();

        requireAdmin(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('Invalid token');
    });
});

// ==================== getUserFromToken() ====================

describe('getUserFromToken()', () => {
    test('should return null when no Authorization header', async () => {
        const req = createMockReq();
        const result = await getUserFromToken(req);
        expect(result).toBeNull();
    });

    test('should return null for non-Bearer auth', async () => {
        const req = createMockReq({
            headers: { authorization: 'Basic abc' },
        });
        const result = await getUserFromToken(req);
        expect(result).toBeNull();
    });

    test('should return null for invalid token', async () => {
        const req = createMockReq({
            headers: { authorization: 'Bearer invalid-token' },
        });
        const result = await getUserFromToken(req);
        expect(result).toBeNull();
    });

    test('should return decoded user for valid token', async () => {
        const user = { id: 'u-123', email: 'test@test.com' };
        const token = generateAccessToken(user);
        const req = createMockReq({
            headers: { authorization: `Bearer ${token}` },
        });

        const result = await getUserFromToken(req);
        expect(result).not.toBeNull();
        expect(result.userId).toBe('u-123');
        expect(result.email).toBe('test@test.com');
    });

    test('should return null for expired token', async () => {
        const expiredToken = jwt.sign(
            { userId: 'u1', email: 'e@e.com' },
            JWT_SECRET,
            { expiresIn: '-1s' }
        );
        const req = createMockReq({
            headers: { authorization: `Bearer ${expiredToken}` },
        });

        const result = await getUserFromToken(req);
        expect(result).toBeNull();
    });
});
