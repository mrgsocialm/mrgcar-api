const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { mapCarRow } = require('../utils/helpers');
const { extractKeyFromPublicUrl, deleteObjects } = require('../services/r2');
const logger = require('../services/logger');

// Transform admin panel data format to app format
function transformCarDataForApp(data) {
    if (!data || typeof data !== 'object') return data;
    
    const transformed = { ...data };
    
    // Transform specifications if they exist
    if (data.specifications && typeof data.specifications === 'object') {
        const specs = data.specifications;
        const appSpecs = {};
        
        // Motor bilgileri
        if (specs.engine) appSpecs['Motor Kodu'] = specs.engine;
        if (specs.engineCapacity) appSpecs['Motor Hacmi'] = specs.engineCapacity;
        if (specs.cylinders !== undefined) appSpecs['Silindir Sayısı'] = specs.cylinders.toString();
        if (specs.valves) appSpecs['Supap Sayısı'] = specs.valves;
        if (specs.power) appSpecs['Güç'] = specs.power;
        if (specs.torque) appSpecs['Tork'] = specs.torque;
        if (specs.transmission) appSpecs['Şanzıman'] = specs.transmission;
        if (specs.drivetrain) appSpecs['Sürüş Tipi'] = specs.drivetrain;
        if (specs.fuelType) appSpecs['Yakıt Tipi'] = specs.fuelType;
        if (specs.fuelCapacity) appSpecs['Yakıt Deposu'] = specs.fuelCapacity;
        
        // Boyutlar
        if (specs.length) appSpecs['Uzunluk'] = specs.length;
        if (specs.width) appSpecs['Genişlik'] = specs.width;
        if (specs.height) appSpecs['Yükseklik'] = specs.height;
        if (specs.wheelbase) appSpecs['Aks Mesafesi'] = specs.wheelbase;
        if (specs.weight) appSpecs['Ağırlık'] = specs.weight;
        if (specs.trunkCapacity) appSpecs['Bagaj Hacmi'] = specs.trunkCapacity;
        
        // Güvenlik
        if (specs.airbags) appSpecs['Hava Yastığı'] = specs.airbags;
        if (specs.abs) appSpecs['ABS'] = specs.abs;
        if (specs.esp) appSpecs['ESP'] = specs.esp;
        if (specs.isofix) appSpecs['ISOFIX'] = specs.isofix;
        
        // Konfor ve Teknoloji
        if (specs.climateControl) appSpecs['Klima'] = specs.climateControl;
        if (specs.navigation) appSpecs['Navigasyon'] = specs.navigation;
        if (specs.bluetooth) appSpecs['Bluetooth'] = specs.bluetooth;
        if (specs.wirelessCharging) appSpecs['Kablosuz Şarj'] = specs.wirelessCharging;
        
        // Merge with existing specifications (if any)
        transformed.specifications = { ...appSpecs, ...(data.specifications || {}) };
    }
    
    // Transform performance data (admin panel sends as performanceData)
    const perfData = data.performanceData || data.performance;
    if (perfData && typeof perfData === 'object') {
        if (!transformed.specifications) transformed.specifications = {};
        
        if (perfData.acceleration) transformed.specifications['0-100 km/s'] = perfData.acceleration;
        if (perfData.topSpeed) transformed.specifications['Maks. Hız'] = perfData.topSpeed;
    }
    
    // Transform efficiency data (admin panel sends as efficiencyData)
    const effData = data.efficiencyData || data.efficiency;
    if (effData && typeof effData === 'object') {
        if (!transformed.specifications) transformed.specifications = {};
        
        if (effData.city) transformed.specifications['Yakıt Tüketimi (Şehir)'] = effData.city;
        if (effData.highway) transformed.specifications['Yakıt Tüketimi (Yol)'] = effData.highway;
        if (effData.combined) transformed.specifications['Yakıt Tüketimi (Karma)'] = effData.combined;
    }
    
    // Keep original performanceData and efficiencyData for backward compatibility
    if (data.performanceData) transformed.performanceData = data.performanceData;
    if (data.efficiencyData) transformed.efficiencyData = data.efficiencyData;
    
    return transformed;
}

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
                        logger.warn('Failed to parse car data JSON:', e);
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
            logger.error("GET /cars/slider error:", err);
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
            logger.error("GET /cars error:", err);
            return apiResponse.errors.serverError(res, 'Araçlar yüklenirken hata oluştu');
        }
    });

    // POST /cars (admin korumalı)
    router.post("/", adminLimiter, requireAdmin, validate(createCarSchema), async (req, res) => {
        try {
            const { make, model, variant, bodyType, status, data } = req.validatedBody || req.body;

            // Transform admin panel data format to app format
            const transformedData = transformCarDataForApp(data || {});

            const { rows } = await pool.query(
                `INSERT INTO cars (make, model, variant, body_type, status, data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *`,
                [make, model, variant || null, bodyType || null, status || 'draft', JSON.stringify(transformedData)]
            );

            return apiResponse.success(res, mapCarRow(rows[0]), 201);
        } catch (err) {
            logger.error("POST /cars error:", err);
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
            logger.error("GET /cars/:id error:", err);
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
                // Transform admin panel data format to app format
                const transformedData = transformCarDataForApp(data);
                updates.push(`data = $${paramIndex++}::jsonb`);
                values.push(JSON.stringify(transformedData));
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
            logger.error("PATCH /cars/:id error:", err);
            return apiResponse.errors.serverError(res, 'Araç güncellenirken hata oluştu');
        }
    });

    // DELETE /cars/:id (admin korumalı)
    router.delete("/:id", adminLimiter, requireAdmin, async (req, res) => {
        try {
            // First, get the car to extract image URLs before deletion
            const { rows: carRows } = await pool.query(
                "SELECT * FROM cars WHERE id = $1",
                [req.params.id]
            );

            if (carRows.length === 0) {
                return apiResponse.errors.notFound(res, 'Araç');
            }

            const car = mapCarRow(carRows[0]);
            
            // Extract image keys from R2 public URLs
            const imageKeys = [];
            if (car.data) {
                const data = typeof car.data === 'string' ? JSON.parse(car.data) : car.data;
                
                // Extract from imageUrls array
                if (data.imageUrls && Array.isArray(data.imageUrls)) {
                    for (const url of data.imageUrls) {
                        if (url && typeof url === 'string') {
                            const key = extractKeyFromPublicUrl(url);
                            if (key) imageKeys.push(key);
                        }
                    }
                }
                
                // Extract from imageUrl (single)
                if (data.imageUrl && typeof data.imageUrl === 'string') {
                    const key = extractKeyFromPublicUrl(data.imageUrl);
                    if (key) imageKeys.push(key);
                }
                
                // Extract from images array (legacy)
                if (data.images && Array.isArray(data.images)) {
                    for (const url of data.images) {
                        if (url && typeof url === 'string') {
                            const key = extractKeyFromPublicUrl(url);
                            if (key) imageKeys.push(key);
                        }
                    }
                }
            }

            // Delete from database
            const { rows } = await pool.query(
                "DELETE FROM cars WHERE id = $1 RETURNING *",
                [req.params.id]
            );

            if (rows.length > 0) {
                // Delete images from R2 (non-blocking, log errors but don't fail the request)
                if (imageKeys.length > 0) {
                    deleteObjects(imageKeys).catch(err => {
                        logger.error('Failed to delete car images from R2:', err);
                    });
                }

                return apiResponse.success(res, { message: 'Araç silindi', car: mapCarRow(rows[0]) });
            } else {
                return apiResponse.errors.notFound(res, 'Araç');
            }
        } catch (err) {
            logger.error("DELETE /cars/:id error:", err);
            return apiResponse.errors.serverError(res, 'Araç silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createCarsRouter;
