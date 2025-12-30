/**
 * Validation Schemas for Cars API
 * Uses Zod for runtime type checking and validation
 */

const { z } = require('zod');

// Status enum
const statusEnum = z.enum(['draft', 'published']).default('draft');

// Car creation schema
const createCarSchema = z.object({
    make: z.string().min(1, 'Marka zorunludur'),
    model: z.string().min(1, 'Model zorunludur'),
    variant: z.string().optional().default(''),
    bodyType: z.string().optional().default(''),
    status: statusEnum,
    data: z.record(z.unknown()).optional().default({}),
});

// Car update schema (partial - all fields optional)
const updateCarSchema = z.object({
    make: z.string().min(1, 'Marka en az 1 karakter olmalı').optional(),
    model: z.string().min(1, 'Model en az 1 karakter olmalı').optional(),
    variant: z.string().optional(),
    bodyType: z.string().optional(),
    status: z.enum(['draft', 'published']).optional(),
    data: z.record(z.unknown()).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'En az bir alan güncellenmelidir',
});

// Query params schema for GET /cars
const listCarsQuerySchema = z.object({
    status: z.enum(['draft', 'published', 'all']).default('published'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

// Validation middleware factory
function validate(schema, source = 'body') {
    return (req, res, next) => {
        try {
            const dataToValidate = source === 'query' ? req.query : req.body;
            const validated = schema.parse(dataToValidate);

            if (source === 'query') {
                req.validatedQuery = validated;
            } else {
                req.validatedBody = validated;
            }

            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    ok: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Girdi doğrulama hatası',
                        details: error.errors.map(e => ({
                            field: e.path.join('.'),
                            message: e.message,
                        })),
                    },
                });
            }

            console.error('Validation Middleware Error:', error);
            next(error);
        }
    };
}

module.exports = {
    createCarSchema,
    updateCarSchema,
    listCarsQuerySchema,
    validate,
    statusEnum,
};
