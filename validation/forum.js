/**
 * Validation Schemas for Forum API
 * Uses Zod for runtime type checking and validation
 */

const { z } = require('zod');

// Forum post creation schema
const createForumPostSchema = z.object({
    title: z.string()
        .min(5, 'Başlık en az 5 karakter olmalı')
        .max(200, 'Başlık en fazla 200 karakter olabilir'),
    description: z.string()
        .min(10, 'Açıklama en az 10 karakter olmalı')
        .max(500, 'Açıklama en fazla 500 karakter olabilir'),
    content: z.string()
        .min(20, 'İçerik en az 20 karakter olmalı')
        .max(10000, 'İçerik en fazla 10000 karakter olabilir'),
    category: z.string().optional().default('Genel Sohbet'),
    categoryId: z.string().optional().default('general'),
    userName: z.string()
        .min(2, 'Kullanıcı adı en az 2 karakter olmalı')
        .max(50, 'Kullanıcı adı en fazla 50 karakter olabilir')
        .optional()
        .default('Anonim'),
    carBrand: z.string().max(50).optional().nullable(),
    carModel: z.string().max(50).optional().nullable(),
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
    createForumPostSchema,
    validate,
};
