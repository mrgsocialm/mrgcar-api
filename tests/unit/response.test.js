/**
 * Unit tests for utils/response.js
 * Standardized API response helpers
 */

const { success, successWithPagination, error, errors } = require('../../utils/response');

// Mock Express response object
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

describe('API Response Helpers', () => {

    // ==================== success() ====================

    describe('success()', () => {
        test('should return 200 with ok:true and data', () => {
            const res = createMockRes();
            success(res, { id: 1, name: 'Test' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                ok: true,
                data: { id: 1, name: 'Test' },
            });
        });

        test('should accept custom status code', () => {
            const res = createMockRes();
            success(res, { created: true }, 201);

            expect(res.statusCode).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.data).toEqual({ created: true });
        });

        test('should handle null data', () => {
            const res = createMockRes();
            success(res, null);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: null });
        });

        test('should handle empty array data', () => {
            const res = createMockRes();
            success(res, []);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ ok: true, data: [] });
        });

        test('should handle deeply nested data', () => {
            const res = createMockRes();
            const nested = { a: { b: { c: [1, 2, { d: 3 }] } } };
            success(res, nested);

            expect(res.body.data).toEqual(nested);
        });
    });

    // ==================== successWithPagination() ====================

    describe('successWithPagination()', () => {
        test('should return 200 with data and pagination object', () => {
            const res = createMockRes();
            const data = [{ id: 1 }, { id: 2 }];
            const pagination = { total: 100, limit: 10, offset: 0, hasMore: true };

            successWithPagination(res, data, pagination);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                ok: true,
                data,
                pagination,
            });
        });

        test('should handle empty data with pagination', () => {
            const res = createMockRes();
            successWithPagination(res, [], { total: 0, limit: 50, offset: 0, hasMore: false });

            expect(res.body.ok).toBe(true);
            expect(res.body.data).toEqual([]);
            expect(res.body.pagination.total).toBe(0);
            expect(res.body.pagination.hasMore).toBe(false);
        });

        test('should include all pagination fields', () => {
            const res = createMockRes();
            const pagination = { total: 250, limit: 50, offset: 50, hasMore: true };
            successWithPagination(res, [{}], pagination);

            expect(res.body.pagination).toHaveProperty('total', 250);
            expect(res.body.pagination).toHaveProperty('limit', 50);
            expect(res.body.pagination).toHaveProperty('offset', 50);
            expect(res.body.pagination).toHaveProperty('hasMore', true);
        });
    });

    // ==================== error() ====================

    describe('error()', () => {
        test('should return error with code and message', () => {
            const res = createMockRes();
            error(res, 'CUSTOM_ERROR', 'Özel hata mesajı', 422);

            expect(res.statusCode).toBe(422);
            expect(res.body).toEqual({
                ok: false,
                error: {
                    code: 'CUSTOM_ERROR',
                    message: 'Özel hata mesajı',
                },
            });
        });

        test('should default to 400 status', () => {
            const res = createMockRes();
            error(res, 'BAD', 'Bad');

            expect(res.statusCode).toBe(400);
        });

        test('should include details when provided', () => {
            const res = createMockRes();
            const details = [
                { field: 'email', message: 'Geçersiz e-posta' },
                { field: 'password', message: 'Şifre gerekli' },
            ];
            error(res, 'VALIDATION_ERROR', 'Doğrulama hatası', 400, details);

            expect(res.body.error.details).toEqual(details);
            expect(res.body.error.details).toHaveLength(2);
        });

        test('should NOT include details key when null', () => {
            const res = createMockRes();
            error(res, 'ERR', 'msg');

            expect(res.body.error).not.toHaveProperty('details');
        });
    });

    // ==================== errors.notFound() ====================

    describe('errors.notFound()', () => {
        test('should return 404 with NOT_FOUND code and resource name', () => {
            const res = createMockRes();
            errors.notFound(res, 'Araç');

            expect(res.statusCode).toBe(404);
            expect(res.body.ok).toBe(false);
            expect(res.body.error.code).toBe('NOT_FOUND');
            expect(res.body.error.message).toContain('Araç');
        });

        test('should use default resource name when not provided', () => {
            const res = createMockRes();
            errors.notFound(res);

            expect(res.statusCode).toBe(404);
            expect(res.body.error.message).toContain('Kaynak');
        });
    });

    // ==================== errors.unauthorized() ====================

    describe('errors.unauthorized()', () => {
        test('should return 401 with UNAUTHORIZED code', () => {
            const res = createMockRes();
            errors.unauthorized(res);

            expect(res.statusCode).toBe(401);
            expect(res.body.ok).toBe(false);
            expect(res.body.error.code).toBe('UNAUTHORIZED');
        });

        test('should accept custom message', () => {
            const res = createMockRes();
            errors.unauthorized(res, 'Token süresi doldu');

            expect(res.body.error.message).toBe('Token süresi doldu');
        });
    });

    // ==================== errors.forbidden() ====================

    describe('errors.forbidden()', () => {
        test('should return 403 with FORBIDDEN code', () => {
            const res = createMockRes();
            errors.forbidden(res);

            expect(res.statusCode).toBe(403);
            expect(res.body.ok).toBe(false);
            expect(res.body.error.code).toBe('FORBIDDEN');
        });
    });

    // ==================== errors.badRequest() ====================

    describe('errors.badRequest()', () => {
        test('should return 400 with BAD_REQUEST code', () => {
            const res = createMockRes();
            errors.badRequest(res);

            expect(res.statusCode).toBe(400);
            expect(res.body.error.code).toBe('BAD_REQUEST');
        });

        test('should accept custom message', () => {
            const res = createMockRes();
            errors.badRequest(res, 'Eksik alanlar var');

            expect(res.body.error.message).toBe('Eksik alanlar var');
        });
    });

    // ==================== errors.serverError() ====================

    describe('errors.serverError()', () => {
        test('should return 500 with SERVER_ERROR code', () => {
            const res = createMockRes();
            errors.serverError(res);

            expect(res.statusCode).toBe(500);
            expect(res.body.ok).toBe(false);
            expect(res.body.error.code).toBe('SERVER_ERROR');
        });
    });

    // ==================== errors.validationError() ====================

    describe('errors.validationError()', () => {
        test('should return 400 with VALIDATION_ERROR code and details', () => {
            const res = createMockRes();
            const details = [{ field: 'make', message: 'Marka zorunludur' }];
            errors.validationError(res, details);

            expect(res.statusCode).toBe(400);
            expect(res.body.ok).toBe(false);
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
            expect(res.body.error.details).toEqual(details);
        });

        test('should handle empty details array', () => {
            const res = createMockRes();
            errors.validationError(res, []);

            expect(res.body.error.details).toEqual([]);
        });
    });
});
