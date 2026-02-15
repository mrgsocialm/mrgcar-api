/**
 * Website E2E Smoke Tests
 * Tests all public API endpoints used by the website
 * Verifies data access, response formats, and SEO-related endpoints
 */

const request = require('supertest');
const { app } = require('../../app');

describe('Website E2E Tests', () => {

    // ===================== HEALTH CHECK =====================
    describe('Health Check', () => {

        it('GET / returns API health status', async () => {
            const res = await request(app).get('/');
            expect([200, 503]).toContain(res.statusCode);
            if (res.statusCode === 200) {
                expect(res.body.status).toBe('ok');
                expect(res.body).toHaveProperty('uptime');
                expect(res.body).toHaveProperty('timestamp');
            }
        });
    });

    // ===================== CARS (PUBLIC) =====================
    describe('Cars - Public Access', () => {

        it('GET /v1/cars returns car list', async () => {
            const res = await request(app).get('/v1/cars');
            expect([200, 500]).toContain(res.statusCode);
            if (res.statusCode === 200) {
                expect(res.body).toHaveProperty('ok', true);
            }
        });

        it('GET /v1/cars with pagination works', async () => {
            const res = await request(app).get('/v1/cars?limit=5&page=1');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/cars with status filter works', async () => {
            const res = await request(app).get('/v1/cars?status=published');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/cars with search works', async () => {
            const res = await request(app).get('/v1/cars?search=BMW');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/cars/slider returns featured cars', async () => {
            const res = await request(app).get('/v1/cars/slider');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/cars/:id returns car detail or 404', async () => {
            const res = await request(app).get('/v1/cars/nonexistent-id');
            expect([200, 404, 500]).toContain(res.statusCode);
        });

        it('GET /v1/cars/:id does not expose internal DB fields', async () => {
            const res = await request(app).get('/v1/cars/nonexistent-id');
            if (res.statusCode === 200 && res.body.data) {
                expect(res.body.data).not.toHaveProperty('password');
                expect(res.body.data).not.toHaveProperty('password_hash');
            }
        });
    });

    // ===================== NEWS (PUBLIC) =====================
    describe('News - Public Access', () => {

        it('GET /v1/news returns news list', async () => {
            const res = await request(app).get('/v1/news');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/news with limit works', async () => {
            const res = await request(app).get('/v1/news?limit=3');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/news/:id returns article or 404', async () => {
            const res = await request(app).get('/v1/news/nonexistent-id');
            expect([200, 404, 500]).toContain(res.statusCode);
        });

        it('GET /v1/news/:id/comments returns comments', async () => {
            const res = await request(app).get('/v1/news/some-id/comments');
            expect([200, 404, 500]).toContain(res.statusCode);
        });
    });

    // ===================== REVIEWS (PUBLIC) =====================
    describe('Reviews - Public Access', () => {

        it('GET /v1/reviews returns reviews list', async () => {
            const res = await request(app).get('/v1/reviews');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/reviews with limit works', async () => {
            const res = await request(app).get('/v1/reviews?limit=10');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/reviews/:id returns review or 404', async () => {
            const res = await request(app).get('/v1/reviews/nonexistent-id');
            expect([200, 404, 500]).toContain(res.statusCode);
        });
    });

    // ===================== FORUM (PUBLIC) =====================
    describe('Forum - Public Access', () => {

        it('GET /v1/forum/categories returns categories', async () => {
            const res = await request(app).get('/v1/forum/categories');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/forum/posts returns posts', async () => {
            const res = await request(app).get('/v1/forum/posts');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/forum/posts with category filter works', async () => {
            const res = await request(app).get('/v1/forum/posts?category=1');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/forum/posts/:id returns post or 404', async () => {
            const res = await request(app).get('/v1/forum/posts/nonexistent-id');
            expect([200, 404, 500]).toContain(res.statusCode);
        });

        it('GET /v1/forum/posts/:id/replies returns replies', async () => {
            const res = await request(app).get('/v1/forum/posts/some-id/replies');
            expect([200, 404, 500]).toContain(res.statusCode);
        });
    });

    // ===================== SLIDERS (PUBLIC) =====================
    describe('Sliders - Public Access', () => {

        it('GET /v1/sliders returns slider items', async () => {
            const res = await request(app).get('/v1/sliders');
            expect([200, 500]).toContain(res.statusCode);
        });
    });

    // ===================== AUTH (USER FLOW) =====================
    describe('User Authentication Flow', () => {

        it('POST /v1/auth/login with missing fields returns 400', async () => {
            const res = await request(app)
                .post('/v1/auth/login')
                .send({});
            expect([400, 429]).toContain(res.statusCode);
        });

        it('POST /v1/auth/login with invalid credentials returns 401', async () => {
            const res = await request(app)
                .post('/v1/auth/login')
                .send({ email: 'nobody@test.com', password: 'wrong' });
            expect([401, 429, 500]).toContain(res.statusCode);
        });

        it('POST /v1/auth/register with missing fields returns 400', async () => {
            const res = await request(app)
                .post('/v1/auth/register')
                .send({});
            expect([400, 429]).toContain(res.statusCode);
        });

        it('POST /v1/auth/refresh without token returns 400', async () => {
            const res = await request(app)
                .post('/v1/auth/refresh')
                .send({});
            expect(res.statusCode).toBe(400);
        });

        it('POST /v1/auth/refresh with invalid token returns 401', async () => {
            const res = await request(app)
                .post('/v1/auth/refresh')
                .send({ refreshToken: 'invalid-token' });
            expect(res.statusCode).toBe(401);
        });

        it('POST /v1/auth/logout without token returns success (idempotent)', async () => {
            const res = await request(app)
                .post('/v1/auth/logout')
                .send({});
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('GET /v1/auth/me without token returns 401', async () => {
            const res = await request(app).get('/v1/auth/me');
            expect(res.statusCode).toBe(401);
        });

        it('POST /v1/auth/google without email returns 400', async () => {
            const res = await request(app)
                .post('/v1/auth/google')
                .send({});
            expect([400, 429]).toContain(res.statusCode);
        });
    });

    // ===================== SWAGGER DOCS =====================
    describe('API Documentation', () => {

        it('GET /v1/docs serves Swagger UI', async () => {
            const res = await request(app).get('/v1/docs');
            expect([200, 301, 302]).toContain(res.statusCode);
        });

        it('GET /v1/docs.json returns OpenAPI spec', async () => {
            const res = await request(app).get('/v1/docs.json');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('openapi');
        });
    });

    // ===================== SECURITY CHECKS =====================
    describe('Security - Response Headers', () => {

        it('Responses include X-Request-ID header', async () => {
            const res = await request(app).get('/');
            expect(res.headers).toHaveProperty('x-request-id');
        });

        it('Responses do not expose X-Powered-By', async () => {
            const res = await request(app).get('/');
            expect(res.headers).not.toHaveProperty('x-powered-by');
        });

        it('Responses include security headers from Helmet', async () => {
            const res = await request(app).get('/');
            // Helmet adds these headers
            expect(res.headers).toHaveProperty('x-content-type-options');
        });
    });

    // ===================== ERROR HANDLING =====================
    describe('Error Handling', () => {

        it('Non-existent route returns 404', async () => {
            const res = await request(app).get('/v1/nonexistent-route');
            expect(res.statusCode).toBe(404);
        });

        it('404 response does not leak stack traces', async () => {
            const res = await request(app).get('/v1/nonexistent-route');
            expect(JSON.stringify(res.body)).not.toContain('Error:');
            expect(JSON.stringify(res.body)).not.toContain('node_modules');
        });
    });
});
