const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { mapForumPost } = require('../utils/helpers');

// Factory function that creates router with injected middleware
function createForumRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, validate, createForumPostSchema, apiResponse } = middlewares;

    // GET /forum/categories - List all forum categories
    router.get('/categories', publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM forum_categories ORDER BY post_count DESC, name ASC'
            );
            return apiResponse.success(res, rows);
        } catch (err) {
            console.error('GET /forum/categories error:', err);
            return apiResponse.errors.serverError(res, 'Forum kategorileri yüklenirken hata oluştu');
        }
    });

    // GET /forum/posts - List all forum posts
    router.get('/posts', publicLimiter, async (req, res) => {
        try {
            const { category, limit = 50, offset = 0 } = req.query;
            
            let query = 'SELECT * FROM forum_posts';
            const params = [];
            let paramIndex = 1;

            if (category) {
                query += ` WHERE category = $${paramIndex++}`;
                params.push(category);
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit), parseInt(offset));

            const { rows } = await pool.query(query, params);
            return apiResponse.success(res, rows.map(mapForumPost));
        } catch (err) {
            console.error('GET /forum/posts error:', err);
            return apiResponse.errors.serverError(res, 'Forum gönderileri yüklenirken hata oluştu');
        }
    });

    // GET /forum/posts/recent - Get recent posts (special route, must come before /posts/:id)
    router.get('/posts/recent', publicLimiter, async (req, res) => {
        try {
            const { limit = 10 } = req.query;
            const { rows } = await pool.query(
                'SELECT * FROM forum_posts ORDER BY created_at DESC LIMIT $1',
                [parseInt(limit)]
            );
            return apiResponse.success(res, rows.map(mapForumPost));
        } catch (err) {
            console.error('GET /forum/posts/recent error:', err);
            return apiResponse.errors.serverError(res, 'Son gönderiler yüklenirken hata oluştu');
        }
    });

    // GET /forum/posts/popular - Get popular posts (special route, must come before /posts/:id)
    router.get('/posts/popular', publicLimiter, async (req, res) => {
        try {
            const { limit = 10 } = req.query;
            const { rows } = await pool.query(
                'SELECT * FROM forum_posts ORDER BY view_count DESC, created_at DESC LIMIT $1',
                [parseInt(limit)]
            );
            return apiResponse.success(res, rows.map(mapForumPost));
        } catch (err) {
            console.error('GET /forum/posts/popular error:', err);
            return apiResponse.errors.serverError(res, 'Popüler gönderiler yüklenirken hata oluştu');
        }
    });

    // GET /forum/posts/:id - Get single forum post (must come after special routes)
    router.get('/posts/:id', publicLimiter, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM forum_posts WHERE id = $1',
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, mapForumPost(rows[0]));
            } else {
                return apiResponse.errors.notFound(res, 'Forum gönderisi');
            }
        } catch (err) {
            console.error('GET /forum/posts/:id error:', err);
            return apiResponse.errors.serverError(res, 'Forum gönderisi yüklenirken hata oluştu');
        }
    });

    // POST /forum/posts - Create forum post
    router.post('/posts', publicLimiter, validate(createForumPostSchema), async (req, res) => {
        try {
            const { title, description, content, category, categoryId, userName, carBrand, carModel } = req.validatedBody || req.body;

            const { rows } = await pool.query(
                `INSERT INTO forum_posts (title, description, content, category, category_id, user_name, car_brand, car_model)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [title, description, content, category || 'Genel Sohbet', categoryId || 'general', userName || 'Anonim', carBrand || null, carModel || null]
            );

            return apiResponse.success(res, mapForumPost(rows[0]), 201);
        } catch (err) {
            console.error('POST /forum/posts error:', err);
            return apiResponse.errors.serverError(res, 'Forum gönderisi oluşturulurken hata oluştu');
        }
    });

    // PATCH /forum/posts/:id - Update forum post (admin only)
    router.patch('/posts/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { title, description, content, category } = req.body;

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

            if (updates.length === 0) {
                return apiResponse.errors.badRequest(res, 'Güncellenecek alan bulunamadı');
            }

            updates.push(`updated_at = NOW()`);
            values.push(req.params.id);

            const query = `UPDATE forum_posts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
            const { rows } = await pool.query(query, values);

            if (rows.length > 0) {
                return apiResponse.success(res, mapForumPost(rows[0]));
            } else {
                return apiResponse.errors.notFound(res, 'Forum gönderisi');
            }
        } catch (err) {
            console.error('PATCH /forum/posts/:id error:', err);
            return apiResponse.errors.serverError(res, 'Forum gönderisi güncellenirken hata oluştu');
        }
    });

    // DELETE /forum/posts/:id - Delete forum post (admin only)
    router.delete('/posts/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                'DELETE FROM forum_posts WHERE id = $1 RETURNING *',
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Forum gönderisi silindi', post: mapForumPost(rows[0]) });
            } else {
                return apiResponse.errors.notFound(res, 'Forum gönderisi');
            }
        } catch (err) {
            console.error('DELETE /forum/posts/:id error:', err);
            return apiResponse.errors.serverError(res, 'Forum gönderisi silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createForumRouter;


