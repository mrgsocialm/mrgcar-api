/**
 * Validation Schemas for Users API
 * Uses Zod for runtime type checking and validation
 */

const { z } = require('zod');

// User update schema (admin updating user fields)
const updateUserSchema = z.object({
    name: z.string().min(1, 'Ad en az 1 karakter olmalı').max(100, 'Ad en fazla 100 karakter olabilir').optional(),
    avatar_url: z.string().url('Geçerli bir URL gereklidir').nullable().optional(),
    role: z.enum(['user', 'moderator', 'admin'], {
        errorMap: () => ({ message: 'Rol user, moderator veya admin olmalıdır' }),
    }).optional(),
    status: z.enum(['active', 'banned', 'temp_banned', 'restricted'], {
        errorMap: () => ({ message: 'Durum active, banned, temp_banned veya restricted olmalıdır' }),
    }).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'En az bir alan güncellenmelidir',
});

// Temporary ban schema
const tempBanSchema = z.object({
    days: z.coerce.number().int().min(1, 'En az 1 gün olmalıdır').max(365, 'En fazla 365 gün olabilir'),
});

// Restrict user schema
const restrictSchema = z.object({
    restrictions: z.array(
        z.enum(['forum', 'comments', 'uploads', 'messaging'], {
            errorMap: () => ({ message: 'Kısıtlama forum, comments, uploads veya messaging olmalıdır' }),
        })
    ).min(1, 'En az bir kısıtlama belirtilmelidir'),
});

module.exports = {
    updateUserSchema,
    tempBanSchema,
    restrictSchema,
};
