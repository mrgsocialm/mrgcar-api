/**
 * Validation Schema Unit Tests
 * Tests all Zod schemas with valid/invalid/edge-case inputs
 */

const { z } = require('zod');

// Import schemas
const { createCarSchema, updateCarSchema, listCarsQuerySchema } = require('../../validation/cars');
const { createForumPostSchema } = require('../../validation/forum');
const { createReviewSchema, updateReviewSchema } = require('../../validation/reviews');
const { updateUserSchema, tempBanSchema, restrictSchema } = require('../../validation/users');
const { presignUploadSchema, deleteUploadSchema } = require('../../validation/uploads');

// ==================== CAR SCHEMAS ====================
describe('Car Validation Schemas', () => {

    describe('createCarSchema', () => {
        test('should accept valid car data', () => {
            const validData = { make: 'BMW', model: 'M3' };
            const result = createCarSchema.parse(validData);
            expect(result.make).toBe('BMW');
            expect(result.model).toBe('M3');
            expect(result.status).toBe('draft');  // default
        });

        test('should reject empty make', () => {
            expect(() => createCarSchema.parse({ make: '', model: 'M3' }))
                .toThrow();
        });

        test('should reject empty model', () => {
            expect(() => createCarSchema.parse({ make: 'BMW', model: '' }))
                .toThrow();
        });

        test('should reject missing make', () => {
            expect(() => createCarSchema.parse({ model: 'M3' }))
                .toThrow();
        });

        test('should reject missing model', () => {
            expect(() => createCarSchema.parse({ make: 'BMW' }))
                .toThrow();
        });

        test('should accept valid status values', () => {
            const draft = createCarSchema.parse({ make: 'BMW', model: 'M3', status: 'draft' });
            expect(draft.status).toBe('draft');

            const published = createCarSchema.parse({ make: 'BMW', model: 'M3', status: 'published' });
            expect(published.status).toBe('published');
        });

        test('should reject invalid status', () => {
            expect(() => createCarSchema.parse({ make: 'BMW', model: 'M3', status: 'deleted' }))
                .toThrow();
        });

        test('should handle data field as object', () => {
            const result = createCarSchema.parse({
                make: 'BMW', model: 'M3',
                data: { engine: '3.0L', hp: 473 }
            });
            expect(result.data.engine).toBe('3.0L');
        });

        test('should strip unknown fields (extra fields)', () => {
            const result = createCarSchema.parse({
                make: 'BMW', model: 'M3',
                __proto__: { polluted: true },
                admin_override: true,
            });
            // Should not retain malicious fields
            expect(result.admin_override).toBeUndefined();
        });
    });

    describe('listCarsQuerySchema', () => {
        test('should apply defaults', () => {
            const result = listCarsQuerySchema.parse({});
            expect(result.status).toBe('published');
            expect(result.limit).toBe(50);
            expect(result.offset).toBe(0);
        });

        test('should coerce string numbers', () => {
            const result = listCarsQuerySchema.parse({ limit: '25', offset: '10' });
            expect(result.limit).toBe(25);
            expect(result.offset).toBe(10);
        });

        test('should reject limit above max', () => {
            expect(() => listCarsQuerySchema.parse({ limit: 500 }))
                .toThrow();
        });

        test('should reject negative offset', () => {
            expect(() => listCarsQuerySchema.parse({ offset: -1 }))
                .toThrow();
        });

        test('should reject non-numeric limit', () => {
            expect(() => listCarsQuerySchema.parse({ limit: 'abc' }))
                .toThrow();
        });
    });

    describe('updateCarSchema', () => {
        test('should reject empty update', () => {
            expect(() => updateCarSchema.parse({}))
                .toThrow(/En az bir alan/);
        });

        test('should accept partial update', () => {
            const result = updateCarSchema.parse({ make: 'Mercedes' });
            expect(result.make).toBe('Mercedes');
        });
    });
});

// ==================== FORUM SCHEMA ====================
describe('Forum Validation Schema', () => {

    describe('createForumPostSchema', () => {
        test('should accept valid forum post', () => {
            const result = createForumPostSchema.parse({
                title: 'Test Başlık Burada',
                description: 'Bu bir test açıklamasıdır.',
                content: 'Bu içerik en az 20 karakter olmak zorundadır.',
            });
            expect(result.title).toBe('Test Başlık Burada');
            expect(result.category).toBe('Genel Sohbet');  // default
        });

        test('should reject title shorter than 5 chars', () => {
            expect(() => createForumPostSchema.parse({
                title: 'Test',
                description: 'Açıklama burada olmalı',
                content: 'İçerik içerik içerik İçerik',
            })).toThrow();
        });

        test('should reject title longer than 200 chars', () => {
            expect(() => createForumPostSchema.parse({
                title: 'A'.repeat(201),
                description: 'Açıklama burada olmalı',
                content: 'İçerik içerik içerik İçerik',
            })).toThrow();
        });

        test('should reject description shorter than 10 chars', () => {
            expect(() => createForumPostSchema.parse({
                title: 'Valid Başlık',
                description: 'Kısa',
                content: 'İçerik içerik içerik İçerik',
            })).toThrow();
        });

        test('should reject content shorter than 20 chars', () => {
            expect(() => createForumPostSchema.parse({
                title: 'Valid Başlık',
                description: 'Bu bir açıklama burada',
                content: 'Kısa içerik',
            })).toThrow();
        });

        test('should reject content longer than 10000 chars', () => {
            expect(() => createForumPostSchema.parse({
                title: 'Valid Başlık',
                description: 'Bu bir açıklama burada',
                content: 'A'.repeat(10001),
            })).toThrow();
        });

        test('should handle optional fields', () => {
            const result = createForumPostSchema.parse({
                title: 'Valid Başlık',
                description: 'Bu bir açıklama burada',
                content: 'İçerik içerik içerik İçerik',
                carBrand: 'BMW',
                carModel: null,
            });
            expect(result.carBrand).toBe('BMW');
            expect(result.carModel).toBeNull();
        });
    });
});

// ==================== REVIEW SCHEMAS ====================
describe('Review Validation Schemas', () => {

    describe('createReviewSchema', () => {
        test('should accept valid review', () => {
            const result = createReviewSchema.parse({
                title: 'Harika Araç',
                content: 'Bu araç çok güzel',
                rating: 5,
            });
            expect(result.title).toBe('Harika Araç');
            expect(result.rating).toBe(5);
        });

        test('should reject rating below 1', () => {
            expect(() => createReviewSchema.parse({
                title: 'Test', content: 'Test content', rating: 0
            })).toThrow();
        });

        test('should reject rating above 5', () => {
            expect(() => createReviewSchema.parse({
                title: 'Test', content: 'Test content', rating: 6
            })).toThrow();
        });

        test('should reject title longer than 200 chars', () => {
            expect(() => createReviewSchema.parse({
                title: 'A'.repeat(201), content: 'Test content'
            })).toThrow();
        });

        test('should reject content longer than 10000 chars', () => {
            expect(() => createReviewSchema.parse({
                title: 'Test', content: 'A'.repeat(10001)
            })).toThrow();
        });

        test('should validate carId as UUID', () => {
            expect(() => createReviewSchema.parse({
                title: 'Test', content: 'Test content',
                carId: 'not-a-uuid'
            })).toThrow(/UUID/i);
        });

        test('should validate image URL format', () => {
            expect(() => createReviewSchema.parse({
                title: 'Test', content: 'Test content',
                image: 'not-a-url'
            })).toThrow();
        });
    });

    describe('updateReviewSchema', () => {
        test('should reject empty update', () => {
            expect(() => updateReviewSchema.parse({}))
                .toThrow(/En az bir alan/);
        });

        test('should accept partial update', () => {
            const result = updateReviewSchema.parse({ title: 'Updated Title' });
            expect(result.title).toBe('Updated Title');
        });
    });
});

// ==================== USER SCHEMAS ====================
describe('User Validation Schemas', () => {

    describe('updateUserSchema', () => {
        test('should accept valid role values', () => {
            const result = updateUserSchema.parse({ role: 'admin' });
            expect(result.role).toBe('admin');

            const mod = updateUserSchema.parse({ role: 'moderator' });
            expect(mod.role).toBe('moderator');
        });

        test('should reject invalid role', () => {
            expect(() => updateUserSchema.parse({ role: 'superadmin' }))
                .toThrow();
        });

        test('should accept valid status values', () => {
            ['active', 'banned', 'temp_banned', 'restricted'].forEach(status => {
                const result = updateUserSchema.parse({ status });
                expect(result.status).toBe(status);
            });
        });

        test('should reject invalid status', () => {
            expect(() => updateUserSchema.parse({ status: 'deleted' }))
                .toThrow();
        });

        test('should reject empty body', () => {
            expect(() => updateUserSchema.parse({}))
                .toThrow(/En az bir alan/);
        });

        test('should validate avatar_url as URL', () => {
            expect(() => updateUserSchema.parse({ avatar_url: 'not-a-url' }))
                .toThrow();
        });

        test('should reject name longer than 100 chars', () => {
            expect(() => updateUserSchema.parse({ name: 'A'.repeat(101) }))
                .toThrow();
        });
    });

    describe('tempBanSchema', () => {
        test('should accept valid day count', () => {
            const result = tempBanSchema.parse({ days: 7 });
            expect(result.days).toBe(7);
        });

        test('should coerce string to number', () => {
            const result = tempBanSchema.parse({ days: '30' });
            expect(result.days).toBe(30);
        });

        test('should reject 0 days', () => {
            expect(() => tempBanSchema.parse({ days: 0 })).toThrow();
        });

        test('should reject more than 365 days', () => {
            expect(() => tempBanSchema.parse({ days: 366 })).toThrow();
        });

        test('should reject negative days', () => {
            expect(() => tempBanSchema.parse({ days: -5 })).toThrow();
        });
    });

    describe('restrictSchema', () => {
        test('should accept valid restrictions', () => {
            const result = restrictSchema.parse({ restrictions: ['forum', 'comments'] });
            expect(result.restrictions).toEqual(['forum', 'comments']);
        });

        test('should reject empty restrictions array', () => {
            expect(() => restrictSchema.parse({ restrictions: [] })).toThrow();
        });

        test('should reject invalid restriction types', () => {
            expect(() => restrictSchema.parse({ restrictions: ['hacking'] })).toThrow();
        });

        test('should accept all valid restriction types', () => {
            const result = restrictSchema.parse({
                restrictions: ['forum', 'comments', 'uploads', 'messaging']
            });
            expect(result.restrictions).toHaveLength(4);
        });
    });
});

// ==================== UPLOAD SCHEMAS ====================
describe('Upload Validation Schemas', () => {

    describe('presignUploadSchema', () => {
        test('should accept valid upload request', () => {
            const result = presignUploadSchema.parse({
                filename: 'car-photo.jpg',
                contentType: 'image/jpeg',
                folder: 'cars',
            });
            expect(result.filename).toBe('car-photo.jpg');
        });

        test('should reject invalid file extension', () => {
            expect(() => presignUploadSchema.parse({
                filename: 'malware.exe',
                contentType: 'image/jpeg',
                folder: 'cars',
            })).toThrow(/extension/i);
        });

        test('should reject invalid content type', () => {
            expect(() => presignUploadSchema.parse({
                filename: 'file.jpg',
                contentType: 'application/javascript',
                folder: 'cars',
            })).toThrow();
        });

        test('should reject invalid folder', () => {
            expect(() => presignUploadSchema.parse({
                filename: 'file.jpg',
                contentType: 'image/jpeg',
                folder: 'system',
            })).toThrow();
        });

        test('should reject empty filename', () => {
            expect(() => presignUploadSchema.parse({
                filename: '',
                contentType: 'image/jpeg',
                folder: 'cars',
            })).toThrow();
        });

        test('should reject filename longer than 255 chars', () => {
            expect(() => presignUploadSchema.parse({
                filename: 'A'.repeat(252) + '.jpg',
                contentType: 'image/jpeg',
                folder: 'cars',
            })).toThrow();
        });

        test('should accept all allowed image types', () => {
            const types = [
                { filename: 'test.jpg', contentType: 'image/jpeg' },
                { filename: 'test.png', contentType: 'image/png' },
                { filename: 'test.webp', contentType: 'image/webp' },
            ];

            for (const { filename, contentType } of types) {
                const result = presignUploadSchema.parse({ filename, contentType, folder: 'cars' });
                expect(result.filename).toBe(filename);
            }
        });

        // Security: path traversal in filename
        test('should handle path traversal attempts in filename', () => {
            // Note: Zod validates extension, but path traversal test
            const payloads = [
                '../../../etc/passwd.jpg',
                '..\\..\\..\\windows\\system32\\cmd.jpg',
            ];

            for (const payload of payloads) {
                // These should still parse as the extension is .jpg
                // But the R2 service should strip path segments
                const result = presignUploadSchema.parse({
                    filename: payload,
                    contentType: 'image/jpeg',
                    folder: 'cars',
                });
                expect(result.filename).toBe(payload);
                // Note: The actual path sanitization happens in the upload route, not schema
            }
        });
    });

    describe('deleteUploadSchema', () => {
        test('should accept key-based deletion', () => {
            const result = deleteUploadSchema.parse({ key: 'cars/bmw/photo.jpg' });
            expect(result.key).toBe('cars/bmw/photo.jpg');
        });

        test('should accept URL-based deletion', () => {
            const result = deleteUploadSchema.parse({ publicUrl: 'https://cdn.mrgcar.com/photo.jpg' });
            expect(result.publicUrl).toBe('https://cdn.mrgcar.com/photo.jpg');
        });

        test('should reject empty request', () => {
            expect(() => deleteUploadSchema.parse({})).toThrow();
        });

        test('should accept batch deletion with keys array', () => {
            const result = deleteUploadSchema.parse({ keys: ['key1', 'key2'] });
            expect(result.keys).toHaveLength(2);
        });

        test('should reject invalid publicUrl format', () => {
            expect(() => deleteUploadSchema.parse({ publicUrl: 'not-a-url' })).toThrow();
        });
    });
});
