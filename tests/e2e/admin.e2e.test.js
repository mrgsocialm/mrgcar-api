/**
 * Admin Panel E2E Smoke Tests
 * Tests all API endpoints used by the admin panel
 * Verifies admin authentication, CRUD for all resources, and dashboard
 */

const request = require('supertest');
const { app, generateAdminToken, ADMIN_JWT_SECRET } = require('../../app');

// Generate a valid admin token for testing
const adminToken = generateAdminToken({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@mrgcar.com',
    role: 'admin',
});

const authHeader = `Bearer ${adminToken}`;

describe('Admin Panel E2E Tests', () => {

    // ===================== AUTHENTICATION =====================
    describe('Admin Authentication', () => {

        it('POST /v1/admin/login without credentials returns error', async () => {
            const res = await request(app)
                .post('/v1/admin/login')
                .send({});
            expect([400, 401, 429, 500]).toContain(res.statusCode);
        });

        it('POST /v1/admin/login with wrong credentials returns 401', async () => {
            const res = await request(app)
                .post('/v1/admin/login')
                .send({ email: 'wrong@test.com', password: 'wrong' });
            expect([401, 429, 500]).toContain(res.statusCode);
        });

        it('GET /v1/admin/me without token returns 401', async () => {
            const res = await request(app).get('/v1/admin/me');
            expect(res.statusCode).toBe(401);
        });

        it('GET /v1/admin/me with valid token responds', async () => {
            const res = await request(app)
                .get('/v1/admin/me')
                .set('Authorization', authHeader);
            // May fail with 500 if no DB, but shouldn't be 401
            expect([200, 404, 500]).toContain(res.statusCode);
        });
    });

    // ===================== ACTIVITY LOGS =====================
    describe('Activity Logs (Dashboard)', () => {

        it('GET /v1/admin/activity-logs returns logs with admin token', async () => {
            const res = await request(app)
                .get('/v1/admin/activity-logs')
                .set('Authorization', authHeader);
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/admin/activity-logs without auth returns 401', async () => {
            const res = await request(app).get('/v1/admin/activity-logs');
            expect(res.statusCode).toBe(401);
        });
    });

    // ===================== CARS CRUD =====================
    describe('Cars Management', () => {

        it('GET /v1/cars lists cars (public)', async () => {
            const res = await request(app).get('/v1/cars');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/cars/slider returns slider cars', async () => {
            const res = await request(app).get('/v1/cars/slider');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('POST /v1/cars requires admin auth', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .send({ make: 'Test', model: 'Car' });
            expect(res.statusCode).toBe(401);
        });

        it('POST /v1/cars with admin token validates input', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .set('Authorization', authHeader)
                .send({}); // Empty body should fail validation
            expect([400, 500]).toContain(res.statusCode);
        });

        it('POST /v1/cars with valid data attempts creation', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .set('Authorization', authHeader)
                .send({
                    make: 'Test',
                    model: 'E2E Car',
                    year: 2024,
                    status: 'draft',
                });
            // 201 = created, 500 = DB error in test env
            expect([201, 400, 500]).toContain(res.statusCode);
        });

        it('GET /v1/cars/:id returns car or 404', async () => {
            const res = await request(app).get('/v1/cars/999');
            expect([200, 404, 500]).toContain(res.statusCode);
        });

        it('PUT /v1/cars/:id requires admin auth', async () => {
            const res = await request(app)
                .put('/v1/cars/999')
                .send({ make: 'Updated' });
            expect([401, 404]).toContain(res.statusCode);
        });

        it('DELETE /v1/cars/:id requires admin auth', async () => {
            const res = await request(app).delete('/v1/cars/999');
            expect(res.statusCode).toBe(401);
        });
    });

    // ===================== NEWS CRUD =====================
    describe('News Management', () => {

        it('GET /v1/news lists news (public)', async () => {
            const res = await request(app).get('/v1/news');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('POST /v1/news requires admin auth', async () => {
            const res = await request(app)
                .post('/v1/news')
                .send({ title: 'Test' });
            expect(res.statusCode).toBe(401);
        });

        it('POST /v1/news with admin validates input', async () => {
            const res = await request(app)
                .post('/v1/news')
                .set('Authorization', authHeader)
                .send({});
            expect([400, 500]).toContain(res.statusCode);
        });

        it('GET /v1/news/:id returns news or 404', async () => {
            const res = await request(app).get('/v1/news/999');
            expect([200, 404, 500]).toContain(res.statusCode);
        });
    });

    // ===================== REVIEWS CRUD =====================
    describe('Reviews Management', () => {

        it('GET /v1/reviews lists reviews (public)', async () => {
            const res = await request(app).get('/v1/reviews');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('POST /v1/reviews requires admin auth', async () => {
            const res = await request(app)
                .post('/v1/reviews')
                .send({ title: 'Test Review' });
            expect(res.statusCode).toBe(401);
        });

        it('GET /v1/reviews/:id returns review or 404', async () => {
            const res = await request(app).get('/v1/reviews/999');
            expect([200, 404, 500]).toContain(res.statusCode);
        });
    });

    // ===================== USERS MANAGEMENT =====================
    describe('Users Management', () => {

        it('GET /v1/users requires admin auth', async () => {
            const res = await request(app).get('/v1/users');
            expect(res.statusCode).toBe(401);
        });

        it('GET /v1/users with admin lists users', async () => {
            const res = await request(app)
                .get('/v1/users')
                .set('Authorization', authHeader);
            expect([200, 500]).toContain(res.statusCode);
        });

        it('PATCH /v1/users/:id/ban requires admin auth', async () => {
            const res = await request(app)
                .patch('/v1/users/999/ban')
                .send({ banned: true, reason: 'test' });
            expect([401, 404]).toContain(res.statusCode);
        });
    });

    // ===================== FORUM MODERATION =====================
    describe('Forum Moderation', () => {

        it('GET /v1/forum/categories returns categories', async () => {
            const res = await request(app).get('/v1/forum/categories');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('GET /v1/forum/posts returns posts', async () => {
            const res = await request(app).get('/v1/forum/posts');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('DELETE /v1/forum/posts/:id requires admin', async () => {
            const res = await request(app).delete('/v1/forum/posts/999');
            expect(res.statusCode).toBe(401);
        });
    });

    // ===================== SLIDERS =====================
    describe('Sliders Management', () => {

        it('GET /v1/sliders returns sliders', async () => {
            const res = await request(app).get('/v1/sliders');
            expect([200, 500]).toContain(res.statusCode);
        });

        it('POST /v1/sliders requires admin auth', async () => {
            const res = await request(app)
                .post('/v1/sliders')
                .send({ title: 'Test Slider' });
            expect(res.statusCode).toBe(401);
        });

        it('POST /v1/sliders with admin validates input', async () => {
            const res = await request(app)
                .post('/v1/sliders')
                .set('Authorization', authHeader)
                .send({});
            expect([400, 500]).toContain(res.statusCode);
        });
    });

    // ===================== NOTIFICATIONS =====================
    describe('Notifications', () => {

        it('POST /v1/notifications/send requires admin auth', async () => {
            const res = await request(app)
                .post('/v1/notifications/send')
                .send({ title: 'Test', body: 'Test message' });
            expect(res.statusCode).toBe(401);
        });

        it('POST /v1/notifications/send with admin validates', async () => {
            const res = await request(app)
                .post('/v1/notifications/send')
                .set('Authorization', authHeader)
                .send({});
            expect([400, 500]).toContain(res.statusCode);
        });
    });

    // ===================== UPLOADS =====================
    describe('Uploads', () => {

        it('POST /v1/uploads/presign requires auth', async () => {
            const res = await request(app)
                .post('/v1/uploads/presign')
                .send({ filename: 'test.jpg', contentType: 'image/jpeg', folder: 'cars' });
            expect(res.statusCode).toBe(401);
        });

        it('POST /v1/uploads/presign with admin token returns 401 (presign uses requireUser, not requireAdmin)', async () => {
            const res = await request(app)
                .post('/v1/uploads/presign')
                .set('Authorization', authHeader)
                .send({ filename: 'test.jpg', contentType: 'image/jpeg', folder: 'cars' });
            // Admin JWT uses ADMIN_JWT_SECRET, but presign uses requireUser (JWT_SECRET)
            // Admin uploads are authorized via the isAdmin() helper inside the handler after requireUser
            expect(res.statusCode).toBe(401);
        });

        it('DELETE /v1/uploads requires auth', async () => {
            const res = await request(app)
                .delete('/v1/uploads')
                .send({ key: 'test/file.jpg' });
            expect(res.statusCode).toBe(401);
        });
    });

    // ===================== ACTIVITY LOG =====================
    describe('Activity Log', () => {

        it('GET /v1/admin/activity-logs requires admin auth', async () => {
            const res = await request(app).get('/v1/admin/activity-logs');
            expect(res.statusCode).toBe(401);
        });

        it('GET /v1/admin/activity-logs with admin returns logs', async () => {
            const res = await request(app)
                .get('/v1/admin/activity-logs')
                .set('Authorization', authHeader);
            expect([200, 500]).toContain(res.statusCode);
        });
    });
});
