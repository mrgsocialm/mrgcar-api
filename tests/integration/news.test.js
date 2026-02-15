/**
 * Integration tests for News API routes
 * DB is mocked — tests validate route logic, auth, validation, and response format
 */

const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

// ========== Mock DB ==========
const mockPool = { query: jest.fn() };
jest.mock('../../db', () => mockPool);

jest.mock('../../services/r2', () => ({
    extractKeyFromPublicUrl: jest.fn((url) => url ? `mock-key/${url.split('/').pop()}` : null),
    deleteObjects: jest.fn(() => Promise.resolve()),
}));

const { generateAdminToken, generateAccessToken } = require('../../middleware/auth');
const createNewsRouter = require('../../routes/news');
const apiResponse = require('../../utils/response');
const { createNewsSchema, updateNewsSchema, validate } = require('../../validation/news');

function buildApp() {
    const app = express();
    app.use(express.json());

    const middlewares = {
        publicLimiter: (req, res, next) => next(),
        adminLimiter: (req, res, next) => next(),
        validate,
        createNewsSchema,
        updateNewsSchema,
        apiResponse,
    };

    app.use('/v1/news', createNewsRouter(middlewares));
    return app;
}

const adminToken = generateAdminToken({ id: 'admin-1', email: 'admin@test.com', role: 'admin' });
const userToken = generateAccessToken({ id: 'user-1', email: 'user@test.com' });

const sampleNewsRow = {
    id: 'news-001',
    title: '2026 Yılın Otomobili',
    description: 'Yılın en çok beğenilen otomobilleri',
    content: 'Detaylı bir haber içeriği burada yer almaktadır ve yeterince uzun.',
    category: 'Ödüller',
    author: 'MRG Editör',
    image: 'https://img.mrgcar.com/news/yilin-otomobili.jpg',
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
};

describe('News API - Integration', () => {
    let app;

    beforeAll(() => { app = buildApp(); });
    afterEach(() => { jest.clearAllMocks(); });

    // ==================== GET /v1/news ====================

    describe('GET /v1/news', () => {
        test('should return news list', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleNewsRow] });

            const res = await request(app).get('/v1/news');

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('2026 Yılın Otomobili');
        });

        test('should return empty array when no news', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get('/v1/news');
            expect(res.body.data).toEqual([]);
        });

        test('should handle DB error', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('DB down'));

            const res = await request(app).get('/v1/news');
            expect(res.statusCode).toBe(500);
        });
    });

    // ==================== GET /v1/news/:id ====================

    describe('GET /v1/news/:id', () => {
        test('should return single news article', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleNewsRow] });

            const res = await request(app).get('/v1/news/news-001');

            expect(res.statusCode).toBe(200);
            expect(res.body.data.id).toBe('news-001');
        });

        test('should return 404 when not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get('/v1/news/nonexistent');

            expect(res.statusCode).toBe(404);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
    });

    // ==================== POST /v1/news ====================

    describe('POST /v1/news', () => {
        const validNews = {
            title: 'Yeni Haber Başlığı',
            description: 'Bu bir test haber açıklamasıdır',
            content: 'Bu bir test haber içeriğidir ve en az 20 karakter olmalı.',
            author: 'Test Yazarı',
        };

        test('should return 401 without auth', async () => {
            const res = await request(app)
                .post('/v1/news')
                .send(validNews);

            expect(res.statusCode).toBe(401);
        });

        test('should create news with admin token', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [{ ...sampleNewsRow }] });

            const res = await request(app)
                .post('/v1/news')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(validNews);

            expect(res.statusCode).toBe(201);
            expect(res.body.ok).toBe(true);
        });

        test('should return 400 with missing title', async () => {
            const res = await request(app)
                .post('/v1/news')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ description: 'Açıklama var', content: 'İçerik var ama yeterince uzun mu?', author: 'Yazar' });

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        test('should return 400 when title too short', async () => {
            const res = await request(app)
                .post('/v1/news')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...validNews, title: 'Kısa' });

            expect(res.statusCode).toBe(400);
        });

        test('should return 400 when content too short', async () => {
            const res = await request(app)
                .post('/v1/news')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...validNews, content: 'Kısa' });

            expect(res.statusCode).toBe(400);
        });

        test('should accept optional image URL', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleNewsRow] });

            const res = await request(app)
                .post('/v1/news')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...validNews, image: 'https://img.com/test.jpg' });

            expect(res.statusCode).toBe(201);
        });

        test('should reject invalid image URL', async () => {
            const res = await request(app)
                .post('/v1/news')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ ...validNews, image: 'not-a-url' });

            expect(res.statusCode).toBe(400);
        });
    });

    // ==================== PATCH /v1/news/:id ====================

    describe('PATCH /v1/news/:id', () => {
        test('should update news fields', async () => {
            const updated = { ...sampleNewsRow, title: 'Güncellenmiş Başlık' };
            mockPool.query.mockResolvedValueOnce({ rows: [updated] });

            const res = await request(app)
                .patch('/v1/news/news-001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Güncellenmiş Başlık' });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.title).toBe('Güncellenmiş Başlık');
        });

        test('should return 400 with empty body', async () => {
            const res = await request(app)
                .patch('/v1/news/news-001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(res.statusCode).toBe(400);
        });

        test('should return 404 when news not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .patch('/v1/news/nonexistent')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Yeni Başlık Test' });

            expect(res.statusCode).toBe(404);
        });
    });

    // ==================== DELETE /v1/news/:id ====================

    describe('DELETE /v1/news/:id', () => {
        test('should delete news and clean up R2', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [sampleNewsRow] })   // SELECT
                .mockResolvedValueOnce({ rows: [sampleNewsRow] });  // DELETE RETURNING

            const res = await request(app)
                .delete('/v1/news/news-001')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.data.message).toContain('silindi');
        });

        test('should return 404 when news not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .delete('/v1/news/nonexistent')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(404);
        });
    });

    // ==================== Comments ====================

    describe('News Comments', () => {
        test('GET /v1/news/:id/comments should return comments', async () => {
            const commentRow = {
                id: 'c1', news_id: 'news-001', user_id: 'u1', user_name: 'Ali',
                content: 'Harika haber', likes: 3, parent_id: null,
                created_at: '2026-02-01T12:00:00Z', updated_at: null,
                reply_to_user_id: null, user_username: 'Ali', user_avatar: null,
                reply_to_username: null,
            };
            mockPool.query.mockResolvedValueOnce({ rows: [commentRow] });

            const res = await request(app).get('/v1/news/news-001/comments');

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].userId).toBe('u1');
            expect(res.body.data[0].content).toBe('Harika haber');
            expect(res.body.data[0]).toHaveProperty('user');
        });

        test('POST /v1/news/:id/comments should require auth', async () => {
            const res = await request(app)
                .post('/v1/news/news-001/comments')
                .send({ content: 'Yorum' });

            expect(res.statusCode).toBe(401);
        });

        test('POST /v1/news/:id/comments should reject empty content', async () => {
            // Content validation happens before any DB call
            const res = await request(app)
                .post('/v1/news/news-001/comments')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ content: '' });

            expect(res.statusCode).toBe(400);
        });

        test('POST /v1/news/:id/comments should reject > 5000 chars', async () => {
            // Content validation happens before any DB call
            const res = await request(app)
                .post('/v1/news/news-001/comments')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ content: 'x'.repeat(5001) });

            expect(res.statusCode).toBe(400);
        });

        test('POST /v1/news/:id/comments should create comment', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ id: 'news-001' }] })      // news exists
                .mockResolvedValueOnce({ rows: [{ name: 'TestUser' }] })     // user name
                .mockResolvedValueOnce({                                      // INSERT
                    rows: [{
                        id: 'c-new', news_id: 'news-001', user_id: 'user-1',
                        user_name: 'TestUser', content: 'Test yorum',
                        likes: 0, parent_id: null, reply_to_user_id: null,
                        created_at: new Date().toISOString(), updated_at: null,
                    }],
                });

            const res = await request(app)
                .post('/v1/news/news-001/comments')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ content: 'Test yorum' });

            expect(res.statusCode).toBe(201);
            expect(res.body.ok).toBe(true);
        });

        test('DELETE /v1/news/:id/comments/:commentId should require admin', async () => {
            const res = await request(app)
                .delete('/v1/news/news-001/comments/c1');

            expect(res.statusCode).toBe(401);
        });

        test('DELETE /v1/news/:id/comments/:commentId should delete', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'c1' }] });

            const res = await request(app)
                .delete('/v1/news/news-001/comments/c1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
        });
    });
});
