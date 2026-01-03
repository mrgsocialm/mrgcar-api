const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Factory function that creates router with injected middleware
function createSlidersRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, validate, createSliderSchema, updateSliderSchema, apiResponse } = middlewares;

    // GET /sliders - List all sliders (from sliders table + cars/news with show_in_slider flag)
    router.get('/', publicLimiter, async (req, res) => {
        try {
            const allSlides = [];
            
            // 1. Get from sliders table
            try {
                const sliderRows = await pool.query(
                    'SELECT * FROM sliders WHERE is_active = TRUE ORDER BY "order" ASC, created_at DESC'
                );
                allSlides.push(...sliderRows.rows.map(row => ({
                    id: row.id,
                    title: row.title,
                    subtitle: row.subtitle,
                    imageUrl: row.image_url,
                    linkType: row.link_type,
                    linkId: row.link_id,
                    linkUrl: row.link_url,
                    order: row.order,
                    source: 'slider'
                })));
            } catch (e) {
                console.warn('Sliders table query failed:', e.message);
            }
            
            // 2. Get cars with show_in_slider = TRUE
            try {
                const carRows = await pool.query(`
                    SELECT id, make, model, slider_title, slider_subtitle, data, slider_order
                    FROM cars 
                    WHERE show_in_slider = TRUE AND status = 'published'
                    ORDER BY slider_order ASC, created_at DESC
                `);
                
                carRows.rows.forEach(row => {
                    let data = {};
                    if (row.data) {
                        try {
                            data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                        } catch (e) {
                            data = {};
                        }
                    }
                    
                    let imageUrl = null;
                    if (data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
                        imageUrl = data.imageUrls[0];
                    } else if (data.imageUrl && typeof data.imageUrl === 'string') {
                        imageUrl = data.imageUrl;
                    }
                    
                    allSlides.push({
                        id: row.id,
                        title: row.slider_title || `${row.make} ${row.model}`,
                        subtitle: row.slider_subtitle || data.summary || '',
                        imageUrl: imageUrl,
                        linkType: 'car',
                        linkId: row.id.toString(),
                        linkUrl: null,
                        order: row.slider_order || 999,
                        source: 'car'
                    });
                });
            } catch (e) {
                console.warn('Cars slider query failed:', e.message);
            }
            
            // 3. Get news with show_in_slider flag (if exists in future)
            // TODO: Add show_in_slider to news table if needed
            
            // Sort by order
            allSlides.sort((a, b) => (a.order || 999) - (b.order || 999));
            
            return apiResponse.success(res, allSlides);
        } catch (err) {
            console.error('GET /sliders error:', err);
            return apiResponse.errors.serverError(res, 'Slider verileri yüklenirken hata oluştu');
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

    // POST /sliders - Add existing content to slider (admin only)
    router.post('/', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { contentType, contentId, sliderTitle, sliderSubtitle, sliderOrder } = req.body;
            
            // contentType: 'car' | 'news' | 'slider'
            // contentId: UUID of car/news or null for new slider
            
            if (contentType === 'car' && contentId) {
                // Mark car for slider
                const { rows } = await pool.query(
                    `UPDATE cars 
                     SET show_in_slider = TRUE, 
                         slider_title = $1, 
                         slider_subtitle = $2, 
                         slider_order = COALESCE($3, (SELECT COALESCE(MAX(slider_order), 0) + 1 FROM cars WHERE show_in_slider = TRUE))
                     WHERE id = $4
                     RETURNING *`,
                    [sliderTitle || null, sliderSubtitle || null, sliderOrder || null, contentId]
                );
                
                if (rows.length === 0) {
                    return apiResponse.errors.notFound(res, 'Araç');
                }
                
                return apiResponse.success(res, { 
                    message: 'Araç slider\'a eklendi',
                    car: rows[0]
                }, 201);
            } else if (contentType === 'news' && contentId) {
                // Mark news for slider (if news table has show_in_slider column)
                // For now, create a slider entry linking to news
                const newsResult = await pool.query('SELECT id, title, description, image FROM news WHERE id = $1', [contentId]);
                if (newsResult.rows.length === 0) {
                    return apiResponse.errors.notFound(res, 'Haber');
                }
                
                const news = newsResult.rows[0];
                const { rows } = await pool.query(
                    `INSERT INTO sliders (title, subtitle, image_url, link_type, link_id, is_active, "order")
                     VALUES ($1, $2, $3, 'news', $4, TRUE, $5)
                     RETURNING *`,
                    [
                        sliderTitle || news.title,
                        sliderSubtitle || news.description || null,
                        news.image || null,
                        contentId,
                        sliderOrder || 0
                    ]
                );
                
                return apiResponse.success(res, rows[0], 201);
            } else if (contentType === 'slider') {
                // Create new standalone slider (for external links)
                const { title, subtitle, imageUrl, linkType, linkId, linkUrl, isActive, order } = req.body;
                
                const { rows } = await pool.query(
                    `INSERT INTO sliders (title, subtitle, image_url, link_type, link_id, link_url, is_active, "order")
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING *`,
                    [title, subtitle || null, imageUrl, linkType || null, linkId || null, linkUrl || null, isActive !== false, order || 0]
                );
                
                return apiResponse.success(res, rows[0], 201);
            } else {
                return apiResponse.errors.badRequest(res, 'Geçersiz contentType veya contentId');
            }
        } catch (err) {
            console.error('POST /sliders error:', err);
            return apiResponse.errors.serverError(res, 'Slider oluşturulurken hata oluştu');
        }
    });

    // PUT /sliders/:id - Update slider (admin only)
    router.put('/:id', adminLimiter, requireAdmin, validate(updateSliderSchema), async (req, res) => {
        try {
            const { title, subtitle, imageUrl, linkType, linkId, linkUrl, isActive, order } = req.validatedBody || req.body;

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

    // DELETE /sliders/:id?source=car|news|slider - Remove from slider (admin only)
    router.delete('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { source } = req.query; // 'car' | 'news' | 'slider'
            
            if (source === 'car') {
                // Remove car from slider
                const { rows } = await pool.query(
                    `UPDATE cars 
                     SET show_in_slider = FALSE, slider_title = NULL, slider_subtitle = NULL, slider_order = NULL
                     WHERE id = $1
                     RETURNING *`,
                    [req.params.id]
                );
                if (rows.length > 0) {
                    return apiResponse.success(res, { message: 'Araç slider\'dan kaldırıldı', car: rows[0] });
                }
            } else {
                // Delete from sliders table
                const { rows } = await pool.query(
                    'DELETE FROM sliders WHERE id = $1 RETURNING *',
                    [req.params.id]
                );
                if (rows.length > 0) {
                    return apiResponse.success(res, { message: 'Slider silindi', slider: rows[0] });
                }
            }
            
            return apiResponse.errors.notFound(res, 'Slider');
        } catch (err) {
            console.error('DELETE /sliders/:id error:', err);
            return apiResponse.errors.serverError(res, 'Slider silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createSlidersRouter;

