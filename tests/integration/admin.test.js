/**
 * Integration tests for Admin API routes
 * DB is mocked
 */

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

const mockPool = { query: jest.fn() };
jest.mock('../../db', () => mockPool);

const { generateAdminToken, requireAdmin } = require('../../middleware/auth');
const createAdminRouter = require('../../routes/admin');

function buildApp() {
    const app = express();
    app.use(express.json());
    const deps = { bcrypt, generateAdminToken, requireAdmin };
    app.use('/v1/admin', createAdminRouter(deps));
    return app;
}

const adminToken = generateAdminToken({ id: 'a1', email: 'admin@mrgcar.com', role: 'admin' });

describe('Admin API - Integration', () => {
    let app;
    let hashedPw;

    beforeAll(async () => {
        app = buildApp();
        hashedPw = await bcrypt.hash('Admin123!', 10);
    });
    afterEach(() => { jest.clearAllMocks(); });

    // ==================== POST /v1/admin/login ====================

    describe('POST /v1/admin/login', () => {
        test('should 400 with missing email', async () => {
            const res = await request(app).post('/v1/admin/login').send({ password: 'X' });
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('required');
        });

        test('should 400 with missing password', async () => {
            const res = await request(app).post('/v1/admin/login').send({ email: 'a@a.com' });
            expect(res.statusCode).toBe(400);
        });

        test('should 400 with empty body', async () => {
            const res = await request(app).post('/v1/admin/login').send({});
            expect(res.statusCode).toBe(400);
        });

        test('should 401 with non-existent email', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).post('/v1/admin/login')
                .send({ email: 'nobody@test.com', password: 'pass' });
            expect(res.statusCode).toBe(401);
            expect(res.body.error).toContain('Invalid');
        });

        test('should 401 with wrong password', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 'a1', email: 'admin@mrgcar.com', password_hash: hashedPw, role: 'admin' }],
            });
            const res = await request(app).post('/v1/admin/login')
                .send({ email: 'admin@mrgcar.com', password: 'WrongPassword' });
            expect(res.statusCode).toBe(401);
        });

        test('should return token on successful login', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 'a1', email: 'admin@mrgcar.com', password_hash: hashedPw, role: 'admin' }],
            });
            const res = await request(app).post('/v1/admin/login')
                .send({ email: 'admin@mrgcar.com', password: 'Admin123!' });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
            expect(res.body.token.split('.')).toHaveLength(3);
            expect(res.body.admin.id).toBe('a1');
            expect(res.body.admin.email).toBe('admin@mrgcar.com');
            expect(res.body.admin.role).toBe('admin');
        });

        test('should not leak password hash in response', async () => {
            mockPool.query.mockResolvedValueOnce({
                rows: [{ id: 'a1', email: 'admin@mrgcar.com', password_hash: hashedPw, role: 'admin' }],
            });
            const res = await request(app).post('/v1/admin/login')
                .send({ email: 'admin@mrgcar.com', password: 'Admin123!' });

            expect(res.body.admin).not.toHaveProperty('password_hash');
        });

        test('should handle DB error gracefully', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('Connection lost'));
            const res = await request(app).post('/v1/admin/login')
                .send({ email: 'admin@mrgcar.com', password: 'Admin123!' });
            expect(res.statusCode).toBe(500);
        });
    });

    // ==================== GET /v1/admin/me ====================

    describe('GET /v1/admin/me', () => {
        test('should 401 without token', async () => {
            const res = await request(app).get('/v1/admin/me');
            expect(res.statusCode).toBe(401);
        });

        test('should return admin info with valid token', async () => {
            const res = await request(app).get('/v1/admin/me')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.admin).toBeDefined();
            expect(res.body.admin.adminId).toBe('a1');
            expect(res.body.admin.role).toBe('admin');
        });

        test('should 401 with invalid token', async () => {
            const res = await request(app).get('/v1/admin/me')
                .set('Authorization', 'Bearer invalid.jwt.token');
            expect(res.statusCode).toBe(401);
        });

        test('should reject legacy x-admin-token (no longer supported)', async () => {
            const res = await request(app).get('/v1/admin/me')
                .set('x-admin-token', 'test-admin-token');
            expect(res.statusCode).toBe(401);
        });
    });
});
