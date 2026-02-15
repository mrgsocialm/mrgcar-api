/**
 * Integration tests for Forum API routes
 * DB is mocked
 */

const request = require('supertest');
const express = require('express');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

const mockPool = { query: jest.fn() };
jest.mock('../../db', () => mockPool);

const { generateAdminToken, generateAccessToken } = require('../../middleware/auth');
const createForumRouter = require('../../routes/forum');
const apiResponse = require('../../utils/response');
const { createForumPostSchema, validate } = require('../../validation/forum');

function buildApp() {
    const app = express();
    app.use(express.json());
    const mw = {
        publicLimiter: (r, s, n) => n(),
        adminLimiter: (r, s, n) => n(),
        validate, createForumPostSchema, apiResponse,
    };
    app.use('/v1/forum', createForumRouter(mw));
    return app;
}

const adminToken = generateAdminToken({ id: 'a1', email: 'a@t.com', role: 'admin' });
const userToken = generateAccessToken({ id: 'u1', email: 'u@t.com' });

const samplePost = {
    id: 'fp-001', user_name: 'Ahmet', title: 'BMW M3 Bakım',
    description: 'M3 bakım deneyimleri', content: 'Detaylı analiz burada.',
    category: 'Bakım', category_id: 'maintenance', car_brand: 'BMW',
    car_model: 'M3', likes: 8, replies: 3, view_count: 120,
    created_at: '2026-02-01T10:00:00Z', is_pinned: false,
};

describe('Forum API - Integration', () => {
    let app;
    beforeAll(() => { app = buildApp(); });
    afterEach(() => { jest.clearAllMocks(); });

    describe('GET /v1/forum/categories', () => {
        test('should return categories', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Genel', post_count: 50 }] });
            const res = await request(app).get('/v1/forum/categories');
            expect(res.statusCode).toBe(200);
            expect(res.body.data).toHaveLength(1);
        });
    });

    describe('GET /v1/forum/posts', () => {
        test('should return posts', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            const res = await request(app).get('/v1/forum/posts');
            expect(res.statusCode).toBe(200);
            expect(res.body.data[0].userName).toBe('Ahmet');
            expect(res.body.data[0].carBrand).toBe('BMW');
        });

        test('should filter by category', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            await request(app).get('/v1/forum/posts?category=Bakım');
            expect(mockPool.query.mock.calls[0][0]).toContain('category');
        });

        test('should return camelCase fields', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            const res = await request(app).get('/v1/forum/posts');
            const p = res.body.data[0];
            expect(p).toHaveProperty('viewCount');
            expect(p).toHaveProperty('categoryId');
            expect(p).toHaveProperty('time');
            expect(p).not.toHaveProperty('view_count');
        });
    });

    describe('GET /v1/forum/posts/recent', () => {
        test('should return recent posts', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            const res = await request(app).get('/v1/forum/posts/recent');
            expect(res.statusCode).toBe(200);
        });
    });

    describe('GET /v1/forum/posts/popular', () => {
        test('should order by view_count DESC', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            await request(app).get('/v1/forum/posts/popular');
            expect(mockPool.query.mock.calls[0][0]).toContain('view_count DESC');
        });
    });

    describe('GET /v1/forum/posts/:id', () => {
        test('should return single post', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            const res = await request(app).get('/v1/forum/posts/fp-001');
            expect(res.statusCode).toBe(200);
            expect(res.body.data.id).toBe('fp-001');
        });

        test('should return 404', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).get('/v1/forum/posts/nonexistent');
            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /v1/forum/posts', () => {
        const valid = {
            title: 'Yeni Forum Gönderisi Başlığı',
            description: 'Açıklama en az 10 karakter olmalı',
            content: 'İçerik en az 20 karakter olmalıdır, uzun metin.',
        };

        test('should create with valid body', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            const res = await request(app).post('/v1/forum/posts').send(valid);
            expect(res.statusCode).toBe(201);
        });

        test('should 400 missing title', async () => {
            const res = await request(app).post('/v1/forum/posts')
                .send({ description: 'Açıklama var burada', content: 'İçerik var burada yeterli uzunlukta' });
            expect(res.statusCode).toBe(400);
        });

        test('should 400 short title', async () => {
            const res = await request(app).post('/v1/forum/posts').send({ ...valid, title: 'Kısa' });
            expect(res.statusCode).toBe(400);
        });

        test('should use defaults', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            await request(app).post('/v1/forum/posts').send(valid);
            const params = mockPool.query.mock.calls[0][1];
            expect(params).toContain('Genel Sohbet');
            expect(params).toContain('Anonim');
        });
    });

    describe('DELETE /v1/forum/posts/:id', () => {
        test('should delete post', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [samplePost] });
            const res = await request(app).delete('/v1/forum/posts/fp-001')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(200);
        });

        test('should 404', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });
            const res = await request(app).delete('/v1/forum/posts/x')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(404);
        });
    });

    describe('Forum Replies', () => {
        test('GET replies', async () => {
            const r = {
                id: 'r1', post_id: 'fp-001', user_id: 'u1', user_name: 'M',
                content: 'Ok', likes: 2, parent_id: null, created_at: '2026-02-01',
                updated_at: null, reply_to_user_id: null, user_username: 'M',
                user_avatar: null, reply_to_username: null
            };
            mockPool.query.mockResolvedValueOnce({ rows: [r] });
            const res = await request(app).get('/v1/forum/posts/fp-001/replies');
            expect(res.statusCode).toBe(200);
            expect(res.body.data).toHaveLength(1);
        });

        test('POST reply requires auth', async () => {
            const res = await request(app).post('/v1/forum/posts/fp-001/replies')
                .send({ content: 'Cevap' });
            expect(res.statusCode).toBe(401);
        });

        test('POST reply creates', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ id: 'fp-001' }] })
                .mockResolvedValueOnce({ rows: [{ name: 'User' }] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'r-new', post_id: 'fp-001', user_id: 'u1',
                        user_name: 'User', content: 'Test', likes: 0, parent_id: null,
                        reply_to_user_id: null, created_at: new Date().toISOString(), updated_at: null
                    }]
                })
                .mockResolvedValueOnce({ rows: [] });
            const res = await request(app).post('/v1/forum/posts/fp-001/replies')
                .set('Authorization', `Bearer ${userToken}`).send({ content: 'Test' });
            expect(res.statusCode).toBe(201);
        });

        test('DELETE reply', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'r1' }] })
                .mockResolvedValueOnce({ rows: [] });
            const res = await request(app).delete('/v1/forum/posts/fp-001/replies/r1')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(200);
        });
    });
});
