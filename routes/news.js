const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Factory function that creates router with injected middleware
function createNewsRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, validate, createNewsSchema, updateNewsSchema, apiResponse } = middlewares;

    // GET /news - List all news
    router.get('/', publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM news ORDER BY created_at DESC'
            );
            return apiResponse.success(res, rows);
        } catch (err) {
            console.error('GET /news error:', err);
            return apiResponse.errors.serverError(res, 'Haberler yüklenirken hata oluştu');
        }
    });

    // GET /news/:id - Get single news article
    router.get('/:id', publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM news WHERE id = $1',
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, rows[0]);
            } else {
                return apiResponse.errors.notFound(res, 'Haber');
            }
        } catch (err) {
            console.error('GET /news/:id error:', err);
            return apiResponse.errors.serverError(res, 'Haber yüklenirken hata oluştu');
        }
    });

    // POST /news - Create news (admin only)
    router.post('/', adminLimiter, requireAdmin, validate(createNewsSchema), async (req, res) => {
        try {
            const { title, description, content, category, author, image } = req.validatedBody || req.body;

            const { rows } = await pool.query(
                `INSERT INTO news (title, description, content, category, author, image)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [title, description, content, category || 'Genel', author, image || null]
            );

            return apiResponse.success(res, rows[0], 201);
        } catch (err) {
            console.error('POST /news error:', err);
            return apiResponse.errors.serverError(res, 'Haber oluşturulurken hata oluştu');
        }
    });

    // PATCH /news/:id - Update news (admin only)
    router.patch('/:id', adminLimiter, requireAdmin, validate(updateNewsSchema), async (req, res) => {
        try {
            const { title, description, content, category, author, image } = req.validatedBody || req.body;

            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (title !== undefined) {
                updates.push(`title = $${paramIndex++}`);
                values.push(title);
            }
            if (description !== undefined) {
                updates.push(`description = $${paramIndex++}`);
                values.push(description);
            }
            if (content !== undefined) {
                updates.push(`content = $${paramIndex++}`);
                values.push(content);
            }
            if (category !== undefined) {
                updates.push(`category = $${paramIndex++}`);
                values.push(category);
            }
            if (author !== undefined) {
                updates.push(`author = $${paramIndex++}`);
                values.push(author);
            }
            if (image !== undefined) {
                updates.push(`image = $${paramIndex++}`);
                values.push(image);
            }

            if (updates.length === 0) {
                return apiResponse.errors.badRequest(res, 'Güncellenecek alan bulunamadı');
            }

            updates.push(`updated_at = NOW()`);
            values.push(req.params.id);

            const query = `UPDATE news SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
            const { rows } = await pool.query(query, values);

            if (rows.length > 0) {
                return apiResponse.success(res, rows[0]);
            } else {
                return apiResponse.errors.notFound(res, 'Haber');
            }
        } catch (err) {
            console.error('PATCH /news/:id error:', err);
            return apiResponse.errors.serverError(res, 'Haber güncellenirken hata oluştu');
        }
    });

    // DELETE /news/:id - Delete news (admin only)
    router.delete('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'DELETE FROM news WHERE id = $1 RETURNING *',
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Haber silindi', news: rows[0] });
            } else {
                return apiResponse.errors.notFound(res, 'Haber');
            }
        } catch (err) {
            console.error('DELETE /news/:id error:', err);
            return apiResponse.errors.serverError(res, 'Haber silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createNewsRouter;

