const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const logger = require('../services/logger');

// Factory function that creates router with injected middleware
function createReviewsRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, validate, createReviewSchema, updateReviewSchema, apiResponse } = middlewares;

    // GET /reviews - List all reviews (public)
    router.get('/', publicLimiter, async (req, res) => {
        try {
            const { limit = 10, offset = 0, featured } = req.query;

            let query = `
                SELECT r.*, u.name as reviewer_name
                FROM reviews r
                LEFT JOIN users u ON r.user_id = u.id
                WHERE COALESCE(r.status, 'published') = 'published'
            `;

            const params = [];
            let paramIndex = 1;

            if (featured === 'true') {
                query += ` AND r.is_featured = true`;
            }

            query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit), parseInt(offset));

            const { rows } = await pool.query(query, params);

            // Map to camelCase
            const reviews = rows.map(row => ({
                id: row.id,
                carId: row.car_id,
                userId: row.user_id,
                reviewerName: row.reviewer_name || row.author_name || 'Anonim',
                authorName: row.author_name,
                isAdminReview: row.is_admin_review,
                rating: row.rating,
                title: row.title,
                content: row.content,
                image: row.images?.[0] || row.image,
                images: row.images || (row.image ? [row.image] : []),
                pros: row.pros,
                cons: row.cons,
                isFeatured: row.is_featured,
                status: row.status,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }));

            return apiResponse.success(res, reviews);
        } catch (err) {
            logger.error('GET /reviews error:', err);
            return apiResponse.errors.serverError(res, 'İncelemeler yüklenirken hata oluştu');
        }
    });

    // GET /reviews/featured - Get featured reviews for home page slider
    router.get('/featured', publicLimiter, async (req, res) => {
        try {
            const { limit = 10 } = req.query;

            const { rows } = await pool.query(`
                SELECT r.*, u.name as reviewer_name
                FROM reviews r
                LEFT JOIN users u ON r.user_id = u.id
                WHERE COALESCE(r.status, 'published') = 'published' AND r.is_featured = true
                ORDER BY r.created_at DESC
                LIMIT $1
            `, [parseInt(limit)]);

            const reviews = rows.map(row => ({
                id: row.id,
                carId: row.car_id,
                userId: row.user_id,
                reviewerName: row.reviewer_name || row.author_name || 'Anonim',
                authorName: row.author_name,
                isAdminReview: row.is_admin_review,
                rating: row.rating,
                title: row.title,
                content: row.content,
                image: row.images?.[0] || row.image,
                images: row.images || (row.image ? [row.image] : []),
                pros: row.pros,
                cons: row.cons,
                isFeatured: row.is_featured,
                createdAt: row.created_at,
            }));

            return apiResponse.success(res, reviews);
        } catch (err) {
            logger.error('GET /reviews/featured error:', err);
            return apiResponse.errors.serverError(res, 'Öne çıkan incelemeler yüklenirken hata oluştu');
        }
    });

    // GET /reviews/:id - Get single review
    router.get('/:id', publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(`
                SELECT r.*, u.name as reviewer_name
                FROM reviews r
                LEFT JOIN users u ON r.user_id = u.id
                WHERE r.id = $1
            `, [req.params.id]);

            if (rows.length === 0) {
                return apiResponse.errors.notFound(res, 'İnceleme');
            }

            const row = rows[0];
            const review = {
                id: row.id,
                carId: row.car_id,
                userId: row.user_id,
                reviewerName: row.reviewer_name || row.author_name || 'Anonim',
                authorName: row.author_name,
                isAdminReview: row.is_admin_review,
                rating: row.rating,
                title: row.title,
                content: row.content,
                image: row.images?.[0] || row.image,
                images: row.images || (row.image ? [row.image] : []),
                pros: row.pros,
                cons: row.cons,
                isFeatured: row.is_featured,
                status: row.status,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };

            return apiResponse.success(res, review);
        } catch (err) {
            logger.error('GET /reviews/:id error:', err);
            return apiResponse.errors.serverError(res, 'İnceleme yüklenirken hata oluştu');
        }
    });

    // POST /reviews - Create review (admin only)
    router.post('/', adminLimiter, requireAdmin, validate(createReviewSchema), async (req, res) => {
        try {
            const { carId, rating, title, content, pros, cons, isFeatured, isAdminReview, image, images, authorName } = req.validatedBody;

            // Normalize: support both single image and images array
            let finalImages = images || [];
            if (!finalImages.length && image) {
                finalImages = [image];
            }

            const { rows } = await pool.query(`
                INSERT INTO reviews (car_id, rating, title, content, pros, cons, is_featured, is_admin_review, image, images, author_name, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published')
                RETURNING *
            `, [carId || null, rating || null, title, content, pros || null, cons || null, isFeatured || false, isAdminReview !== false, finalImages[0] || null, finalImages.length ? finalImages : null, authorName || null]);

            return apiResponse.success(res, rows[0], 201);
        } catch (err) {
            logger.error('POST /reviews error:', err);
            return apiResponse.errors.serverError(res, 'İnceleme oluşturulurken hata oluştu');
        }
    });

    // PUT /reviews/:id - Update review (admin only)
    router.put('/:id', adminLimiter, requireAdmin, validate(updateReviewSchema), async (req, res) => {
        try {
            const { carId, rating, title, content, pros, cons, isFeatured, status, images } = req.validatedBody;

            const { rows } = await pool.query(`
                UPDATE reviews
                SET car_id = COALESCE($1, car_id),
                    rating = COALESCE($2, rating),
                    title = COALESCE($3, title),
                    content = COALESCE($4, content),
                    pros = COALESCE($5, pros),
                    cons = COALESCE($6, cons),
                    is_featured = COALESCE($7, is_featured),
                    status = COALESCE($8, status),
                    images = COALESCE($9, images),
                    image = COALESCE($10, image),
                    updated_at = NOW()
                WHERE id = $11
                RETURNING *
            `, [carId, rating, title, content, pros, cons, isFeatured, status, images || null, images?.[0] || null, req.params.id]);

            if (rows.length === 0) {
                return apiResponse.errors.notFound(res, 'İnceleme');
            }

            return apiResponse.success(res, rows[0]);
        } catch (err) {
            logger.error('PUT /reviews/:id error:', err);
            return apiResponse.errors.serverError(res, 'İnceleme güncellenirken hata oluştu');
        }
    });

    // DELETE /reviews/:id - Delete review (admin only)
    router.delete('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'DELETE FROM reviews WHERE id = $1 RETURNING *',
                [req.params.id]
            );

            if (rows.length === 0) {
                return apiResponse.errors.notFound(res, 'İnceleme');
            }

            return apiResponse.success(res, { message: 'İnceleme silindi' });
        } catch (err) {
            logger.error('DELETE /reviews/:id error:', err);
            return apiResponse.errors.serverError(res, 'İnceleme silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createReviewsRouter;
