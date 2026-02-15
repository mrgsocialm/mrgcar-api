/**
 * Integration tests for Reviews API routes
 * DB is mocked
 */

const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

const mockPool = { query: jest.fn() };
jest.mock('../../db', () => mockPool);

const { generateAdminToken } = require('../../middleware/auth');
const createReviewsRouter = require('../../routes/reviews');
const apiResponse = require('../../utils/response');
const { createReviewSchema, updateReviewSchema } = require('../../validation/reviews');

// Inline validate middleware (mirrors the one in validation files)
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.errors.map(e => e.message).join(', ');
            return res.status(400).json({ ok: false, error: errors });
        }
        req.validatedBody = result.data;
        next();
    };
}

function buildApp() {
    const app = express();
    app.use(express.json());
    const mw = {
        publicLimiter: (r, s, n) => n(),
        adminLimiter: (r, s, n) => n(),
        validate,
        createReviewSchema,
        updateReviewSchema,
        apiResponse,
    };
    app.use('/v1/reviews', createReviewsRouter(mw));
    return app;
}

const adminToken = generateAdminToken({ id: 'a1', email: 'a@t.com', role: 'admin' });

const sampleReview = {
    id: 'rev-001', title: 'BMW M3 İnceleme', content: 'Detaylı inceleme.',
    author: 'MRG', rating: 5, image: 'https://img.com/review.jpg',
    car_id: 'car-001', car_make: 'BMW', car_model: 'M3',
    is_featured: true, published: true,
    created_at: '2026-01-15', updated_at: '2026-01-15',
};

describe('Reviews API - Integration', () => {
    let app;
    beforeAll(() => { app = buildApp(); });
    afterEach(() => { jest.clearAllMocks(); });

    describe('GET /v1/reviews', () => {
        test('should return reviews list', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleReview] });
            const res = await request(app).get('/v1/reviews');
            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('BMW M3 İnceleme');
        });

        test('should return empty when no reviews', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).get('/v1/reviews');
            expect(res.body.data).toEqual([]);
        });

        test('should handle DB error', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('DB down'));
            const res = await request(app).get('/v1/reviews');
            expect(res.statusCode).toBe(500);
        });
    });

    describe('GET /v1/reviews/featured', () => {
        test('should return featured reviews only', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleReview] });
            const res = await request(app).get('/v1/reviews/featured');
            expect(res.statusCode).toBe(200);
            const q = mockPool.query.mock.calls[0][0];
            expect(q).toContain('is_featured');
        });
    });

    describe('GET /v1/reviews/:id', () => {
        test('should return single review', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleReview] });
            const res = await request(app).get('/v1/reviews/rev-001');
            expect(res.statusCode).toBe(200);
            expect(res.body.data.id).toBe('rev-001');
        });

        test('should return 404', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).get('/v1/reviews/nonexistent');
            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /v1/reviews', () => {
        const valid = { title: 'Yeni İnceleme', content: 'Detaylı içerik', rating: 4 };

        test('should require admin auth', async () => {
            const res = await request(app).post('/v1/reviews').send(valid);
            expect(res.statusCode).toBe(401);
        });

        test('should create review', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [{ ...sampleReview, ...valid }] });
            const res = await request(app).post('/v1/reviews')
                .set('Authorization', `Bearer ${adminToken}`).send(valid);
            expect(res.statusCode).toBe(201);
            expect(res.body.ok).toBe(true);
        });

        test('should 400 missing title', async () => {
            const res = await request(app).post('/v1/reviews')
                .set('Authorization', `Bearer ${adminToken}`).send({ content: 'X', rating: 3 });
            expect(res.statusCode).toBe(400);
        });

        test('should 400 invalid rating (>5)', async () => {
            const res = await request(app).post('/v1/reviews')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Test', content: 'X', rating: 10 });
            expect(res.statusCode).toBe(400);
        });

        test('should 400 invalid rating (<1)', async () => {
            const res = await request(app).post('/v1/reviews')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Test', content: 'X', rating: -1 });
            expect(res.statusCode).toBe(400);
        });
    });

    describe('PUT /v1/reviews/:id', () => {
        test('should update review', async () => {
            const updated = { ...sampleReview, title: 'Güncel' };
            mockPool.query.mockResolvedValueOnce({ rows: [updated] });
            const res = await request(app).put('/v1/reviews/rev-001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Güncel' });
            expect(res.statusCode).toBe(200);
        });

        test('should 404 not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).put('/v1/reviews/nonexistent')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'X' });
            expect(res.statusCode).toBe(404);
        });
    });

    describe('DELETE /v1/reviews/:id', () => {
        test('should delete review', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleReview] });
            const res = await request(app).delete('/v1/reviews/rev-001')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(200);
        });

        test('should 404 not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).delete('/v1/reviews/x')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(404);
        });
    });
});
