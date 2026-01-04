const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { mapCarRow } = require('../utils/helpers');
const { extractKeyFromPublicUrl, deleteObjects } = require('../services/r2');

// Factory function that creates router with injected middleware
function createCarsRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, validate, createCarSchema, updateCarSchema, listCarsQuerySchema, apiResponse } = middlewares;

    // GET /cars/slider - Cars marked for homepage slider
    router.get("/slider", publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(`
        SELECT * FROM cars 
        WHERE show_in_slider = TRUE AND status = 'published'
        ORDER BY slider_order ASC, created_at DESC
        LIMIT 10
      `);

            return apiResponse.success(res, rows.map(row => {
                // data JSONB field'ını parse et
                let data = {};
                if (row.data) {
                    try {
                        data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                    } catch (e) {
                        console.warn('Failed to parse car data JSON:', e);
                        data = {};
                    }
                }

                // Görsel URL'ini bul - önce imageUrls array'inden, sonra imageUrl'den
                let imageUrl = null;
                if (data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
                    imageUrl = data.imageUrls[0];
                } else if (data.imageUrl && typeof data.imageUrl === 'string') {
                    imageUrl = data.imageUrl;
                } else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                    imageUrl = data.images[0];
                }

                return {
                    id: row.id,
                    make: row.make,
                    model: row.model,
                    title: row.slider_title || `${row.make} ${row.model}`,
                    subtitle: row.slider_subtitle || data.summary || '',
                    imageUrl: imageUrl,
                    linkType: 'car',
                    linkValue: row.id.toString(),
                };
            }));
        } catch (err) {
            console.error("GET /cars/slider error:", err);
            return apiResponse.errors.serverError(res, 'Slider verileri yüklenirken hata oluştu');
        }
    });

    // GET /cars?status=published|draft|all&limit=50&offset=0
    router.get("/", publicLimiter, validate(listCarsQuerySchema, 'query'), async (req, res) => {
        try {
            const { status, limit, offset } = req.validatedQuery || { status: 'published', limit: 50, offset: 0 };

            let countQuery, dataQuery;
            let queryParams;

            if (status === 'all') {
                countQuery = "SELECT COUNT(*) FROM cars";
                dataQuery = "SELECT * FROM cars ORDER BY created_at DESC LIMIT $1 OFFSET $2";
                queryParams = [limit, offset];
            } else {
                countQuery = "SELECT COUNT(*) FROM cars WHERE status = $1";
                dataQuery = "SELECT * FROM cars WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
                queryParams = [status, limit, offset];
            }

            const countResult = await pool.query(
                countQuery,
                status === 'all' ? [] : [status]
            );
            const total = parseInt(countResult.rows[0].count, 10);

            const { rows } = await pool.query(dataQuery, queryParams);

            return apiResponse.successWithPagination(res, rows.map(mapCarRow), {
                total,
                limit,
                offset,
                hasMore: offset + rows.length < total,
            });
        } catch (err) {
            console.error("GET /cars error:", err);
            return apiResponse.errors.serverError(res, 'Araçlar yüklenirken hata oluştu');
        }
    });

    // POST /cars (admin korumalı)
    router.post("/", adminLimiter, requireAdmin, validate(createCarSchema), async (req, res) => {
        try {
            const { make, model, variant, bodyType, status, data } = req.validatedBody || req.body;

            const { rows } = await pool.query(
                `INSERT INTO cars (make, model, variant, body_type, status, data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *`,
                [make, model, variant || null, bodyType || null, status || 'draft', JSON.stringify(data || {})]
            );

            return apiResponse.success(res, mapCarRow(rows[0]), 201);
        } catch (err) {
            console.error("POST /cars error:", err);
            return apiResponse.errors.serverError(res, 'Araç oluşturulurken hata oluştu');
        }
    });

    // GET /cars/:id
    router.get("/:id", publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(
                "SELECT * FROM cars WHERE id = $1",
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, mapCarRow(rows[0]));
            } else {
                return apiResponse.errors.notFound(res, 'Araç');
            }
        } catch (err) {
            console.error("GET /cars/:id error:", err);
            return apiResponse.errors.serverError(res, 'Araç yüklenirken hata oluştu');
        }
    });

    // PATCH /cars/:id (admin korumalı)
    router.patch("/:id", adminLimiter, requireAdmin, validate(updateCarSchema), async (req, res) => {
        try {
            const { make, model, variant, bodyType, status, data, showInSlider, sliderTitle, sliderSubtitle, sliderOrder } = req.body;

            if (status && !["published", "draft"].includes(status)) {
                return res.status(400).json({ error: "status must be 'published' or 'draft'" });
            }

            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (make !== undefined) {
                updates.push(`make = $${paramIndex++}`);
                values.push(make);
            }
            if (model !== undefined) {
                updates.push(`model = $${paramIndex++}`);
                values.push(model);
            }
            if (variant !== undefined) {
                updates.push(`variant = $${paramIndex++}`);
                values.push(variant);
            }
            if (bodyType !== undefined) {
                updates.push(`body_type = $${paramIndex++}`);
                values.push(bodyType);
            }
            if (status !== undefined) {
                updates.push(`status = $${paramIndex++}`);
                values.push(status);
            }
            if (data !== undefined) {
                updates.push(`data = $${paramIndex++}::jsonb`);
                values.push(JSON.stringify(data));
            }
            if (showInSlider !== undefined) {
                updates.push(`show_in_slider = $${paramIndex++}`);
                values.push(showInSlider);
            }
            if (sliderTitle !== undefined) {
                updates.push(`slider_title = $${paramIndex++}`);
                values.push(sliderTitle);
            }
            if (sliderSubtitle !== undefined) {
                updates.push(`slider_subtitle = $${paramIndex++}`);
                values.push(sliderSubtitle);
            }
            if (sliderOrder !== undefined) {
                updates.push(`slider_order = $${paramIndex++}`);
                values.push(sliderOrder);
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: "No fields to update" });
            }

            updates.push(`updated_at = NOW()`);
            values.push(req.params.id);

            const query = `UPDATE cars SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`;
            const { rows } = await pool.query(query, values);

            if (rows.length > 0) {
                return apiResponse.success(res, mapCarRow(rows[0]));
            } else {
                return apiResponse.errors.notFound(res, 'Araç');
            }
        } catch (err) {
            console.error("PATCH /cars/:id error:", err);
            return apiResponse.errors.serverError(res, 'Araç güncellenirken hata oluştu');
        }
    });

    // DELETE /cars/:id (admin korumalı)
    router.delete("/:id", adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                "DELETE FROM cars WHERE id = $1 RETURNING *",
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Araç silindi', car: mapCarRow(rows[0]) });
            } else {
                return apiResponse.errors.notFound(res, 'Araç');
            }
        } catch (err) {
            console.error("DELETE /cars/:id error:", err);
            return apiResponse.errors.serverError(res, 'Araç silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createCarsRouter;
