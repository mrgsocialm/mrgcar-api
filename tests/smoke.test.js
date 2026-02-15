// Smoke tests for API endpoints
// Run with: npm test

const request = require('supertest');

// Mock environment for tests
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

// Note: These tests require a running database connection
// For now, they test that routes are properly mounted and respond

describe('API Smoke Tests', () => {
    let app;

    beforeAll(() => {
        // Import app after setting env vars
        const appModule = require('../app');
        app = appModule.app;
    });

    describe('Health Check', () => {
        test('GET / should return health status', async () => {
            const res = await request(app).get('/');
            // 200 if DB connected, 503 if degraded (no DB)
            expect([200, 503]).toContain(res.statusCode);
            expect(res.body).toHaveProperty('status');
        });
    });

    describe('API v1 Cars Routes', () => {
        test('GET /v1/cars should respond (may error without DB)', async () => {
            const res = await request(app).get('/v1/cars');
            // Route is mounted - may return 500 if no DB, 200 if DB connected
            expect([200, 500]).toContain(res.statusCode);
        });

        test('GET /v1/cars/slider should respond (may error without DB)', async () => {
            const res = await request(app).get('/v1/cars/slider');
            expect([200, 500]).toContain(res.statusCode);
        });

        test('GET /v1/cars/123 should respond (may error without DB)', async () => {
            const res = await request(app).get('/v1/cars/123');
            // 404 if not found, 500 if no DB, 200 if found
            expect([200, 404, 500]).toContain(res.statusCode);
        });

        test('POST /v1/cars without auth should return 401', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .send({ make: 'Test', model: 'Car' });
            expect(res.statusCode).toBe(401);
        });
    });

    describe('API v1 Auth Routes', () => {
        test('POST /v1/auth/login with invalid credentials should respond', async () => {
            const res = await request(app)
                .post('/v1/auth/login')
                .send({ email: 'test@test.com', password: 'test' });
            expect([401, 500]).toContain(res.statusCode);
        });

        test('GET /v1/auth/me without token should return 401', async () => {
            const res = await request(app).get('/v1/auth/me');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('API v1 Admin Routes', () => {
        test('POST /v1/admin/login with invalid credentials should respond', async () => {
            const res = await request(app)
                .post('/v1/admin/login')
                .send({ email: 'admin@test.com', password: 'wrong' });
            expect([401, 500]).toContain(res.statusCode);
        });

        test('GET /v1/admin/me without token should return 401', async () => {
            const res = await request(app).get('/v1/admin/me');
            expect(res.statusCode).toBe(401);
        });
    });

    describe('API v1 Upload Routes', () => {
        test('POST /v1/uploads/presign without auth should return 401', async () => {
            const res = await request(app)
                .post('/v1/uploads/presign')
                .send({ filename: 'test.jpg', contentType: 'image/jpeg' });
            expect(res.statusCode).toBe(401);
        });

        test('POST /v1/uploads/presign with invalid body should return 400', async () => {
            // Mock admin token (in real test, use actual token)
            const res = await request(app)
                .post('/v1/uploads/presign')
                .set('Authorization', 'Bearer mock-admin-token')
                .send({ filename: 'test.txt', contentType: 'text/plain' });
            // May return 401 (invalid token) or 400 (validation error)
            expect([400, 401]).toContain(res.statusCode);
        });
    });

    describe('Swagger Docs', () => {
        test('GET /v1/docs should serve Swagger UI', async () => {
            const res = await request(app).get('/v1/docs/');
            expect([200, 301, 302]).toContain(res.statusCode);
        });

        test('GET /v1/docs.json should return OpenAPI spec', async () => {
            const res = await request(app).get('/v1/docs.json');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('openapi');
            expect(res.body.info.title).toBe('MRGCar API');
        });
    });
});
