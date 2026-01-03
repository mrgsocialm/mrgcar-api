/**
 * Validation Schemas for News API
 * Uses Zod for runtime type checking and validation
 */

const { z } = require('zod');

// News article creation schema
const createNewsSchema = z.object({
    title: z.string()
        .min(5, 'Başlık en az 5 karakter olmalı')
        .max(200, 'Başlık en fazla 200 karakter olabilir'),
    description: z.string()
        .min(10, 'Açıklama en az 10 karakter olmalı')
        .max(500, 'Açıklama en fazla 500 karakter olabilir'),
    content: z.string()
        .min(20, 'İçerik en az 20 karakter olmalı')
        .max(50000, 'İçerik en fazla 50000 karakter olabilir'),
    category: z.string()
        .max(100, 'Kategori en fazla 100 karakter olabilir')
        .optional()
        .default('Genel'),
    author: z.string()
        .min(2, 'Yazar adı en az 2 karakter olmalı')
        .max(100, 'Yazar adı en fazla 100 karakter olabilir'),
    image: z.string()
        .url('Geçerli bir URL olmalı')
        .optional()
        .nullable(),
});

// News article update schema (all fields optional, but if provided must be valid)
const updateNewsSchema = z.object({
    title: z.string()
        .min(5, 'Başlık en az 5 karakter olmalı')
        .max(200, 'Başlık en fazla 200 karakter olabilir')
        .optional(),
    description: z.string()
        .min(10, 'Açıklama en az 10 karakter olmalı')
        .max(500, 'Açıklama en fazla 500 karakter olabilir')
        .optional(),
    content: z.string()
        .min(20, 'İçerik en az 20 karakter olmalı')
        .max(50000, 'İçerik en fazla 50000 karakter olabilir')
        .optional(),
    category: z.string()
        .max(100, 'Kategori en fazla 100 karakter olabilir')
        .optional(),
    author: z.string()
        .min(2, 'Yazar adı en az 2 karakter olmalı')
        .max(100, 'Yazar adı en fazla 100 karakter olabilir')
        .optional(),
    image: z.string()
        .url('Geçerli bir URL olmalı')
        .optional()
        .nullable(),
});

// Validation middleware factory
function validate(schema, source = 'body') {
    return (req, res, next) => {
        try {
            if (!schema || typeof schema.parse !== 'function') {
                console.error('Validation Middleware Error: schema is undefined or not a Zod schema');
                return res.status(500).json({
                    ok: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Doğrulama şeması tanımlı değil',
                    },
                });
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
    createNewsSchema,
    updateNewsSchema,
    validate,
};


