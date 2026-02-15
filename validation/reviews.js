/**
 * Validation Schemas for Reviews API
 * Uses Zod for runtime type checking and validation
 */

const { z } = require('zod');

// Review creation schema
const createReviewSchema = z.object({
    carId: z.string().uuid('Geçerli bir araç ID\'si gereklidir').nullable().optional(),
    rating: z.coerce.number().int().min(1, 'Rating en az 1 olmalıdır').max(10, 'Rating en fazla 10 olabilir').optional(),
    title: z.string().min(1, 'Başlık zorunludur').max(200, 'Başlık en fazla 200 karakter olabilir'),
    content: z.string().min(1, 'İçerik zorunludur').max(10000, 'İçerik en fazla 10.000 karakter olabilir'),
    pros: z.string().max(2000, 'Artılar en fazla 2.000 karakter olabilir').nullable().optional(),
    cons: z.string().max(2000, 'Eksiler en fazla 2.000 karakter olabilir').nullable().optional(),
    isFeatured: z.boolean().optional().default(false),
    isAdminReview: z.boolean().optional().default(true),
    // Support both single image (backward compat) and images array
    image: z.string().url('Geçerli bir resim URL\'si gereklidir').nullable().optional(),
    images: z.array(z.string().url('Geçerli bir resim URL\'si gereklidir')).max(10, 'En fazla 10 görsel eklenebilir').optional(),
    authorName: z.string().max(100, 'Yazar adı en fazla 100 karakter olabilir').nullable().optional(),
});

// Review update schema (partial - all fields optional)
const updateReviewSchema = z.object({
    carId: z.string().uuid('Geçerli bir araç ID\'si gereklidir').nullable().optional(),
    rating: z.coerce.number().int().min(1, 'Rating en az 1 olmalıdır').max(10, 'Rating en fazla 10 olabilir').optional(),
    title: z.string().min(1, 'Başlık en az 1 karakter olmalı').max(200).optional(),
    content: z.string().min(1, 'İçerik en az 1 karakter olmalı').max(10000).optional(),
    pros: z.string().max(2000).nullable().optional(),
    cons: z.string().max(2000).nullable().optional(),
    isFeatured: z.boolean().optional(),
    status: z.enum(['draft', 'published']).optional(),
    images: z.array(z.string().url()).max(10, 'En fazla 10 görsel eklenebilir').optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'En az bir alan güncellenmelidir',
});

module.exports = {
    createReviewSchema,
    updateReviewSchema,
};
