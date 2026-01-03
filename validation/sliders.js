/**
 * Validation Schemas for Sliders API
 * Uses Zod for runtime type checking and validation
 */

const { z } = require('zod');

// Slider creation schema
const createSliderSchema = z.object({
    title: z.string()
        .min(3, 'Başlık en az 3 karakter olmalı')
        .max(255, 'Başlık en fazla 255 karakter olabilir'),
    subtitle: z.string()
        .max(500, 'Alt başlık en fazla 500 karakter olabilir')
        .optional()
        .nullable(),
    imageUrl: z.string()
        .url('Geçerli bir görsel URL olmalı')
        .min(1, 'Görsel URL zorunludur'),
    linkType: z.enum(['car', 'news', 'external', null], {
        errorMap: () => ({ message: 'Link tipi car, news, external veya null olmalı' })
    })
        .optional()
        .nullable(),
    linkId: z.string()
        .uuid('Link ID geçerli bir UUID olmalı')
        .optional()
        .nullable(),
    linkUrl: z.string()
        .url('Geçerli bir URL olmalı')
        .optional()
        .nullable(),
    isActive: z.boolean()
        .optional()
        .default(true),
    order: z.number()
        .int('Sıra numarası tam sayı olmalı')
        .min(0, 'Sıra numarası 0 veya daha büyük olmalı')
        .optional()
        .default(0),
});

// Slider update schema (all fields optional, but if provided must be valid)
const updateSliderSchema = z.object({
    title: z.string()
        .min(3, 'Başlık en az 3 karakter olmalı')
        .max(255, 'Başlık en fazla 255 karakter olabilir')
        .optional(),
    subtitle: z.string()
        .max(500, 'Alt başlık en fazla 500 karakter olabilir')
        .optional()
        .nullable(),
    imageUrl: z.string()
        .url('Geçerli bir görsel URL olmalı')
        .optional(),
    linkType: z.enum(['car', 'news', 'external', null], {
        errorMap: () => ({ message: 'Link tipi car, news, external veya null olmalı' })
    })
        .optional()
        .nullable(),
    linkId: z.string()
        .uuid('Link ID geçerli bir UUID olmalı')
        .optional()
        .nullable(),
    linkUrl: z.string()
        .url('Geçerli bir URL olmalı')
        .optional()
        .nullable(),
    isActive: z.boolean()
        .optional(),
    order: z.number()
        .int('Sıra numarası tam sayı olmalı')
        .min(0, 'Sıra numarası 0 veya daha büyük olmalı')
        .optional(),
});

// Validation middleware factory
function validate(schema, source = 'body') {
    return (req, res, next) => {
        try {
            // Check if schema is valid Zod schema
            if (!schema || typeof schema.parse !== 'function' || !schema._def) {
                console.error('Validation Middleware Error: schema is undefined or not a Zod schema');
                // Skip validation if schema is invalid, just pass through
                if (source === 'query') {
                    req.validatedQuery = req.query;
                } else {
                    req.validatedBody = req.body;
                }
                return next();
            }
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
            next(error);
        }
    };
}

module.exports = {
    createSliderSchema,
    updateSliderSchema,
    validate,
};


