const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Factory function that creates router with injected middleware
function createSlidersRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, apiResponse } = middlewares;

    // GET /sliders - List all sliders
    router.get('/', publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM sliders WHERE is_active = TRUE ORDER BY "order" ASC, created_at DESC'
            );
            return apiResponse.success(res, rows);
        } catch (err) {
            console.error('GET /sliders error:', err);
            // Fallback to cars/slider if sliders table doesn't exist
            return apiResponse.success(res, []);
        }
    });

    // GET /sliders/:id - Get single slider
    router.get('/:id', publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM sliders WHERE id = $1',
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, rows[0]);
            } else {
                return apiResponse.errors.notFound(res, 'Slider');
            }
        } catch (err) {
            console.error('GET /sliders/:id error:', err);
            return apiResponse.errors.serverError(res, 'Slider yüklenirken hata oluştu');
        }
    });

    // POST /sliders - Create slider (admin only)
    router.post('/', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { title, subtitle, imageUrl, linkType, linkId, linkUrl, isActive, order } = req.body;

            if (!title || !imageUrl) {
                return apiResponse.errors.badRequest(res, 'Başlık ve görsel URL zorunludur');
            }

            const { rows } = await pool.query(
                `INSERT INTO sliders (title, subtitle, image_url, link_type, link_id, link_url, is_active, "order")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [title, subtitle || null, imageUrl, linkType || null, linkId || null, linkUrl || null, isActive !== false, order || 0]
            );

            return apiResponse.success(res, rows[0], 201);
        } catch (err) {
            console.error('POST /sliders error:', err);
            return apiResponse.errors.serverError(res, 'Slider oluşturulurken hata oluştu');
        }
    });

    // PUT /sliders/:id - Update slider (admin only)
    router.put('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { title, subtitle, imageUrl, linkType, linkId, linkUrl, isActive, order } = req.body;

            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (title !== undefined) {
                updates.push(`title = $${paramIndex++}`);
                values.push(title);
            }
            if (subtitle !== undefined) {
                updates.push(`subtitle = $${paramIndex++}`);
                values.push(subtitle);
            }
            if (imageUrl !== undefined) {
                updates.push(`image_url = $${paramIndex++}`);
                values.push(imageUrl);
            }
            if (linkType !== undefined) {
                updates.push(`link_type = $${paramIndex++}`);
                values.push(linkType);
            }
            if (linkId !== undefined) {
                updates.push(`link_id = $${paramIndex++}`);
                values.push(linkId);
            }
            if (linkUrl !== undefined) {
                updates.push(`link_url = $${paramIndex++}`);
                values.push(linkUrl);
            }
            if (isActive !== undefined) {
                updates.push(`is_active = $${paramIndex++}`);
                values.push(isActive);
            }
            if (order !== undefined) {
                updates.push(`"order" = $${paramIndex++}`);
                values.push(order);
            }

            if (updates.length === 0) {
                return apiResponse.errors.badRequest(res, 'Güncellenecek alan bulunamadı');
            }

            updates.push(`updated_at = NOW()`);
            values.push(req.params.id);

            const query = `UPDATE sliders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
            const { rows } = await pool.query(query, values);

            if (rows.length > 0) {
                return apiResponse.success(res, rows[0]);
            } else {
                return apiResponse.errors.notFound(res, 'Slider');
            }
        } catch (err) {
            console.error('PUT /sliders/:id error:', err);
            return apiResponse.errors.serverError(res, 'Slider güncellenirken hata oluştu');
        }
    });

    // DELETE /sliders/:id - Delete slider (admin only)
    router.delete('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'DELETE FROM sliders WHERE id = $1 RETURNING *',
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Slider silindi', slider: rows[0] });
            } else {
                return apiResponse.errors.notFound(res, 'Slider');
            }
        } catch (err) {
            console.error('DELETE /sliders/:id error:', err);
            return apiResponse.errors.serverError(res, 'Slider silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createSlidersRouter;

