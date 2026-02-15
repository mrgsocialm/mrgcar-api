/**
 * Integration tests for Cars API routes
 * DB is mocked — tests validate route logic, auth, validation, and response format
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

// ========== Mock DB ==========
const mockPool = { query: jest.fn() };
jest.mock('../../db', () => mockPool);

// ========== Mock R2 ==========
jest.mock('../../services/r2', () => ({
    extractKeyFromPublicUrl: jest.fn((url) => url ? `mock-key/${url.split('/').pop()}` : null),
    deleteObjects: jest.fn(() => Promise.resolve()),
    generatePresignedUploadUrl: jest.fn(),
    getPublicUrl: jest.fn(),
    isConfigured: jest.fn(() => true),
}));

const { generateAdminToken } = require('../../middleware/auth');
const createCarsRouter = require('../../routes/cars');
const apiResponse = require('../../utils/response');
const { createCarSchema, updateCarSchema, listCarsQuerySchema, validate } = require('../../validation/cars');

// ========== Build test app ==========
function buildApp() {
    const app = express();
    app.use(express.json());

    const middlewares = {
        publicLimiter: (req, res, next) => next(),
        adminLimiter: (req, res, next) => next(),
        validate,
        createCarSchema,
        updateCarSchema,
        listCarsQuerySchema,
        apiResponse,
    };

    app.use('/v1/cars', createCarsRouter(middlewares));
    return app;
}

// ========== Helpers ==========
const adminToken = generateAdminToken({ id: 'admin-1', email: 'admin@test.com', role: 'admin' });

const sampleCarRow = {
    id: 'car-001',
    make: 'BMW',
    model: 'M3',
    variant: 'Competition',
    body_type: 'Sedan',
    status: 'published',
    data: { summary: 'Spor sedan', imageUrls: ['https://img.com/m3.jpg'] },
    show_in_slider: false,
    slider_title: null,
    slider_subtitle: null,
    slider_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
};

// ========== Tests ==========

describe('Cars API - Integration', () => {
    let app;

    beforeAll(() => {
        app = buildApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ==================== GET /v1/cars ====================

    describe('GET /v1/cars', () => {
        test('should return paginated car list', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: '2' }] })  // count query
                .mockResolvedValueOnce({ rows: [sampleCarRow, { ...sampleCarRow, id: 'car-002', make: 'Audi' }] }); // data query

            const res = await request(app).get('/v1/cars');

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.pagination).toBeDefined();
            expect(res.body.pagination.total).toBe(2);
        });

        test('should filter by status=draft', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get('/v1/cars?status=draft');

            expect(res.statusCode).toBe(200);
            expect(res.body.data).toEqual([]);
            expect(res.body.pagination.total).toBe(0);
        });

        test('should accept status=all', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })
                .mockResolvedValueOnce({ rows: [sampleCarRow] });

            const res = await request(app).get('/v1/cars?status=all');

            expect(res.statusCode).toBe(200);
        });

        test('should reject invalid status', async () => {
            const res = await request(app).get('/v1/cars?status=invalid');

            expect(res.statusCode).toBe(400);
            expect(res.body.ok).toBe(false);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        test('should validate limit and offset', async () => {
            const res = await request(app).get('/v1/cars?limit=-5&offset=abc');
            expect(res.statusCode).toBe(400);
        });

        test('should return camelCase fields', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: '1' }] })
                .mockResolvedValueOnce({ rows: [sampleCarRow] });

            const res = await request(app).get('/v1/cars');
            const car = res.body.data[0];

            expect(car).toHaveProperty('bodyType');
            expect(car).toHaveProperty('showInSlider');
            expect(car).toHaveProperty('createdAt');
            expect(car).not.toHaveProperty('body_type');
            expect(car).not.toHaveProperty('show_in_slider');
        });

        test('should handle DB error gracefully', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));

            const res = await request(app).get('/v1/cars');

            expect(res.statusCode).toBe(500);
            expect(res.body.ok).toBe(false);
        });
    });

    // ==================== GET /v1/cars/slider ====================

    describe('GET /v1/cars/slider', () => {
        test('should return slider cars with imageUrl extracted', async () => {
            const sliderRow = {
                ...sampleCarRow,
                show_in_slider: true,
                slider_title: 'Yeni BMW',
                data: { imageUrls: ['https://img.com/slide.jpg'], summary: 'Güzel araç' },
            };
            mockPool.query.mockResolvedValueOnce({ rows: [sliderRow] });

            const res = await request(app).get('/v1/cars/slider');

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data[0]).toHaveProperty('imageUrl', 'https://img.com/slide.jpg');
            expect(res.body.data[0]).toHaveProperty('title', 'Yeni BMW');
            expect(res.body.data[0]).toHaveProperty('linkType', 'car');
        });

        test('should fallback to imageUrl when imageUrls is empty', async () => {
            const row = {
                ...sampleCarRow,
                data: { imageUrl: 'https://img.com/single.jpg' },
            };
            mockPool.query.mockResolvedValueOnce({ rows: [row] });

            const res = await request(app).get('/v1/cars/slider');
            expect(res.body.data[0].imageUrl).toBe('https://img.com/single.jpg');
        });

        test('should fallback to images array (legacy)', async () => {
            const row = {
                ...sampleCarRow,
                data: { images: ['https://img.com/legacy.jpg'] },
            };
            mockPool.query.mockResolvedValueOnce({ rows: [row] });

            const res = await request(app).get('/v1/cars/slider');
            expect(res.body.data[0].imageUrl).toBe('https://img.com/legacy.jpg');
        });

        test('should return null imageUrl when no images', async () => {
            const row = { ...sampleCarRow, data: {} };
            mockPool.query.mockResolvedValueOnce({ rows: [row] });

            const res = await request(app).get('/v1/cars/slider');
            expect(res.body.data[0].imageUrl).toBeNull();
        });

        test('should handle stringified data JSON', async () => {
            const row = {
                ...sampleCarRow,
                data: JSON.stringify({ imageUrls: ['https://img.com/str.jpg'] }),
            };
            mockPool.query.mockResolvedValueOnce({ rows: [row] });

            const res = await request(app).get('/v1/cars/slider');
            expect(res.body.data[0].imageUrl).toBe('https://img.com/str.jpg');
        });
    });

    // ==================== GET /v1/cars/:id ====================

    describe('GET /v1/cars/:id', () => {
        test('should return single car', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [sampleCarRow] });

            const res = await request(app).get('/v1/cars/car-001');

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.id).toBe('car-001');
            expect(res.body.data.make).toBe('BMW');
        });

        test('should return 404 when car not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app).get('/v1/cars/nonexistent');

            expect(res.statusCode).toBe(404);
            expect(res.body.ok).toBe(false);
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
    });

    // ==================== POST /v1/cars ====================

    describe('POST /v1/cars', () => {
        test('should return 401 without auth', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .send({ make: 'Tesla', model: 'Model 3' });

            expect(res.statusCode).toBe(401);
        });

        test('should create car with valid admin token', async () => {
            const newCarRow = { ...sampleCarRow, id: 'car-new', make: 'Tesla', model: 'Model 3' };
            mockPool.query.mockResolvedValueOnce({ rows: [newCarRow] });

            const res = await request(app)
                .post('/v1/cars')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ make: 'Tesla', model: 'Model 3', status: 'draft', data: {} });

            expect(res.statusCode).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.make).toBe('Tesla');
        });

        test('should return 400 with missing required fields', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        test('should return 400 when make is empty string', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ make: '', model: 'X5' });

            expect(res.statusCode).toBe(400);
        });

        test('should accept valid data with specs and transform', async () => {
            const row = { ...sampleCarRow, data: {} };
            mockPool.query.mockResolvedValueOnce({ rows: [row] });

            const res = await request(app)
                .post('/v1/cars')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    make: 'BMW',
                    model: 'X5',
                    data: {
                        specifications: { engine: '3.0L', power: '340 beygir' },
                        performanceData: { acceleration: '5.5s', topSpeed: '250 km/s' },
                        efficiencyData: { city: '12L', highway: '8L', combined: '10L' },
                    },
                });

            expect(res.statusCode).toBe(201);
            // Verify the query was called with transformed data
            const queryCall = mockPool.query.mock.calls[0];
            const insertedData = JSON.parse(queryCall[1][5]); // data param
            expect(insertedData.specifications).toBeDefined();
        });

        test('should reject invalid status value in create', async () => {
            const res = await request(app)
                .post('/v1/cars')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ make: 'BMW', model: 'X5', status: 'archived' });

            expect(res.statusCode).toBe(400);
        });
    });

    // ==================== PATCH /v1/cars/:id ====================

    describe('PATCH /v1/cars/:id', () => {
        test('should return 401 without auth', async () => {
            const res = await request(app)
                .patch('/v1/cars/car-001')
                .send({ make: 'Audi' });

            expect(res.statusCode).toBe(401);
        });

        test('should update car fields', async () => {
            const updatedRow = { ...sampleCarRow, make: 'Mercedes' };
            mockPool.query.mockResolvedValueOnce({ rows: [updatedRow] });

            const res = await request(app)
                .patch('/v1/cars/car-001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ make: 'Mercedes' });

            expect(res.statusCode).toBe(200);
            expect(res.body.data.make).toBe('Mercedes');
        });

        test('should return 400 with empty body', async () => {
            const res = await request(app)
                .patch('/v1/cars/car-001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(res.statusCode).toBe(400);
        });

        test('should return 404 when car not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .patch('/v1/cars/nonexistent')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ make: 'Update' });

            expect(res.statusCode).toBe(404);
        });

        test('should reject invalid status in update', async () => {
            const res = await request(app)
                .patch('/v1/cars/car-001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'archived' });

            // Validation at schema level or route level
            expect([400]).toContain(res.statusCode);
        });
    });

    // ==================== DELETE /v1/cars/:id ====================

    describe('DELETE /v1/cars/:id', () => {
        test('should return 401 without auth', async () => {
            const res = await request(app).delete('/v1/cars/car-001');
            expect(res.statusCode).toBe(401);
        });

        test('should delete car and return success', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [sampleCarRow] })  // SELECT for images
                .mockResolvedValueOnce({ rows: [sampleCarRow] }); // DELETE RETURNING

            const res = await request(app)
                .delete('/v1/cars/car-001')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.data.message).toContain('silindi');
        });

        test('should return 404 when car not found', async () => {
            mockPool.query.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .delete('/v1/cars/nonexistent')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(404);
        });

        test('should attempt R2 cleanup on delete', async () => {
            const { deleteObjects } = require('../../services/r2');
            const carWithImages = {
                ...sampleCarRow,
                data: { imageUrls: ['https://img.com/a.jpg', 'https://img.com/b.jpg'] },
            };
            mockPool.query
                .mockResolvedValueOnce({ rows: [carWithImages] })
                .mockResolvedValueOnce({ rows: [carWithImages] });

            await request(app)
                .delete('/v1/cars/car-001')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(deleteObjects).toHaveBeenCalled();
        });
    });
});

// ==================== transformCarDataForApp — UNIT ====================

describe('transformCarDataForApp() — via POST', () => {
    let app;
    const adminToken = generateAdminToken({ id: 'a1', email: 'a@a.com', role: 'admin' });

    beforeAll(() => {
        app = buildApp();
    });

    afterEach(() => jest.clearAllMocks());

    test('should transform specifications object to Turkish keys', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [sampleCarRow] });

        await request(app)
            .post('/v1/cars')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                make: 'BMW', model: 'M3',
                data: {
                    specifications: {
                        engine: 'S58B30',
                        power: '510 hp',
                        torque: '650 Nm',
                        transmission: '8-speed M Steptronic',
                        fuelType: 'Benzin',
                    },
                },
            });

        const insertedData = JSON.parse(mockPool.query.mock.calls[0][1][5]);
        expect(insertedData.specifications['Motor Kodu']).toBe('S58B30');
        expect(insertedData.specifications['Güç']).toBe('510 hp');
        expect(insertedData.specifications['Tork']).toBe('650 Nm');
        expect(insertedData.specifications['Şanzıman']).toBe('8-speed M Steptronic');
    });

    test('should merge performanceData into specifications', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [sampleCarRow] });

        await request(app)
            .post('/v1/cars')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                make: 'BMW', model: 'M3',
                data: {
                    performanceData: { acceleration: '3.9s', topSpeed: '290 km/s' },
                },
            });

        const insertedData = JSON.parse(mockPool.query.mock.calls[0][1][5]);
        expect(insertedData.specifications['0-100 km/s']).toBe('3.9s');
        expect(insertedData.specifications['Maks. Hız']).toBe('290 km/s');
    });

    test('should merge efficiencyData into specifications', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [sampleCarRow] });

        await request(app)
            .post('/v1/cars')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                make: 'BMW', model: 'M3',
                data: {
                    efficiencyData: { city: '14L', highway: '8L', combined: '11L' },
                },
            });

        const insertedData = JSON.parse(mockPool.query.mock.calls[0][1][5]);
        expect(insertedData.specifications['Yakıt Tüketimi (Şehir)']).toBe('14L');
        expect(insertedData.specifications['Yakıt Tüketimi (Yol)']).toBe('8L');
        expect(insertedData.specifications['Yakıt Tüketimi (Karma)']).toBe('11L');
    });

    test('should handle null/undefined data gracefully', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [sampleCarRow] });

        const res = await request(app)
            .post('/v1/cars')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ make: 'Fiat', model: 'Egea' });

        expect(res.statusCode).toBe(201);
    });
});
