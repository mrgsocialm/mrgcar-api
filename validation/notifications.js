/**
 * Validation Schemas for Notifications API
 * Uses Zod for runtime type checking and validation
 */

const { z } = require('zod');

// Notification send schema
const sendNotificationSchema = z.object({
    title: z.string()
        .min(3, 'Başlık en az 3 karakter olmalı')
        .max(100, 'Başlık en fazla 100 karakter olabilir'),
    body: z.string()
        .min(5, 'Mesaj en az 5 karakter olmalı')
        .max(500, 'Mesaj en fazla 500 karakter olabilir'),
    topic: z.string()
        .min(1, 'Topic zorunludur')
        .max(50, 'Topic en fazla 50 karakter olabilir')
        .optional()
        .default('all'),
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
    sendNotificationSchema,
    validate,
};


