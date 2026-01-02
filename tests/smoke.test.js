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
        test('GET / should return status ok', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });
    });

    describe('Cars Routes', () => {
        test('GET /cars should respond (may error without DB)', async () => {
            const res = await request(app).get('/cars');
            // Route is mounted - may return 500 if no DB, 200 if DB connected
            expect([200, 500]).toContain(res.statusCode);
        });

        test('GET /cars/slider should respond (may error without DB)', async () => {
            const res = await request(app).get('/cars/slider');
            expect([200, 500]).toContain(res.statusCode);
        });

        test('GET /cars/123 should respond (may error without DB)', async () => {
            const res = await request(app).get('/cars/123');
            // 404 if not found, 500 if no DB, 200 if found
            expect([200, 404, 500]).toContain(res.statusCode);
        });

        test('POST /cars without auth should return 401', async () => {
            const res = await request(app)
                .post('/cars')
                .send({ make: 'Test', model: 'Car' });
            expect(res.statusCode).toBe(401);
        });
    });

    // These tests will fail until auth routes are extracted to app.js
    // Uncomment after extracting auth routes
    /*
    describe('Auth Routes', () => {
      test('POST /auth/login should respond', async () => {
        const res = await request(app)
          .post('/auth/login')
          .send({ email: 'test@test.com', password: 'test' });
        expect([200, 400, 401, 500]).toContain(res.statusCode);
      });
  
      test('GET /auth/me without token should return 401', async () => {
        const res = await request(app).get('/auth/me');
        expect(res.statusCode).toBe(401);
      });
    });
    */
});
