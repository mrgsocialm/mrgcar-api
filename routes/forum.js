const express = require('express');
const pool = require('../db');
const { requireAdmin, requireUser } = require('../middleware/auth');
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

    // ==================== REPLIES ENDPOINTS ====================

    // GET /forum/posts/:postId/replies - Get all replies for a post
    router.get('/posts/:postId/replies', publicLimiter, async (req, res) => {
        try {
            const { postId } = req.params;
            // Join with users again to get reply_to_user details and main user details properly
            const query = `
                SELECT 
                    fr.id, fr.post_id, fr.user_id, fr.user_name, fr.content, fr.likes, fr.parent_id, 
                    fr.created_at, fr.updated_at, fr.reply_to_user_id,
                    u.username as user_username, u.avatar_url as user_avatar,
                    ru.username as reply_to_username
                FROM forum_replies fr
                LEFT JOIN users u ON fr.user_id = u.id
                LEFT JOIN users ru ON fr.reply_to_user_id = ru.id
                WHERE fr.post_id = $1
                ORDER BY fr.created_at ASC
            `;

            const { rows } = await pool.query(query, [postId]);

            const replies = rows.map(row => ({
                id: row.id,
                postId: row.post_id,
                userId: row.user_id,
                userName: row.user_name,
                user: {
                    id: row.user_id,
                    username: row.user_username || row.user_name,
                    avatarUrl: row.user_avatar
                },
                content: row.content,
                likes: row.likes || 0,
                parentId: row.parent_id || null,
                replyToUserId: row.reply_to_user_id || null,
                replyToUser: row.reply_to_user_id ? {
                    id: row.reply_to_user_id,
                    username: row.reply_to_username
                } : null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                isLiked: false, // Client will track this locally for now
            }));

            return apiResponse.success(res, replies);
        } catch (err) {
            console.error('GET /forum/posts/:postId/replies error:', err);
            return apiResponse.errors.serverError(res, 'Cevaplar yüklenirken hata oluştu');
        }
    });

    // POST /forum/posts/:postId/replies - Create a new reply (requires auth)
    router.post('/posts/:postId/replies', publicLimiter, requireUser, async (req, res) => {
        try {
            const { postId } = req.params;
            const { content, parentId } = req.body;
            const userId = req.user.userId;

            if (!content || content.trim().length === 0) {
                return apiResponse.errors.badRequest(res, 'Cevap içeriği boş olamaz');
            }

            if (content.length > 5000) {
                return apiResponse.errors.badRequest(res, 'Cevap içeriği 5000 karakterden uzun olamaz');
            }

            // Check if post exists
            const postCheck = await pool.query('SELECT id FROM forum_posts WHERE id = $1', [postId]);
            if (postCheck.rows.length === 0) {
                return apiResponse.errors.notFound(res, 'Forum gönderisi');
            }

            // If parentId is provided, verify parent reply exists
            let replyToUserId = null;
            if (parentId) {
                const parentCheck = await pool.query('SELECT id, user_id FROM forum_replies WHERE id = $1 AND post_id = $2', [parentId, postId]);
                if (parentCheck.rows.length === 0) {
                    return apiResponse.errors.notFound(res, 'Üst cevap');
                }
                replyToUserId = parentCheck.rows[0].user_id;
            }

            // Get user name from users table or use default
            let userName = 'Anonim';
            try {
                const userResult = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
                if (userResult.rows.length > 0 && userResult.rows[0].name) {
                    userName = userResult.rows[0].name;
                }
            } catch (e) {
                console.warn('Could not fetch user name:', e.message);
            }

            // Insert reply with optional parentId
            const { rows } = await pool.query(
                `INSERT INTO forum_replies (post_id, user_id, user_name, content, parent_id, reply_to_user_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [postId, userId, userName, content.trim(), parentId || null, replyToUserId]
            );

            // Increment reply count on the post
            await pool.query(
                'UPDATE forum_posts SET replies = replies + 1, updated_at = NOW() WHERE id = $1',
                [postId]
            );

            const reply = {
                id: rows[0].id,
                postId: rows[0].post_id,
                userId: rows[0].user_id,
                userName: rows[0].user_name,
                content: rows[0].content,
                likes: rows[0].likes || 0,
                parentId: rows[0].parent_id || null,
                replyToUserId: rows[0].reply_to_user_id || null,
                createdAt: rows[0].created_at,
                updatedAt: rows[0].updated_at,
                isLiked: false,
            };

            return apiResponse.success(res, reply, 201);
        } catch (err) {
            console.error('POST /forum/posts/:postId/replies error:', err);
            return apiResponse.errors.serverError(res, 'Cevap oluşturulurken hata oluştu');
        }
    });

    // DELETE /forum/posts/:postId/replies/:replyId - Delete a reply (admin only)
    router.delete('/posts/:postId/replies/:replyId', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { postId, replyId } = req.params;

            const { rows } = await pool.query(
                'DELETE FROM forum_replies WHERE id = $1 AND post_id = $2 RETURNING *',
                [replyId, postId]
            );

            if (rows.length > 0) {
                // Decrement reply count on the post
                await pool.query(
                    'UPDATE forum_posts SET replies = GREATEST(replies - 1, 0), updated_at = NOW() WHERE id = $1',
                    [postId]
                );

                return apiResponse.success(res, { message: 'Cevap silindi' });
            } else {
                return apiResponse.errors.notFound(res, 'Cevap');
            }
        } catch (err) {
            console.error('DELETE /forum/posts/:postId/replies/:replyId error:', err);
            return apiResponse.errors.serverError(res, 'Cevap silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createForumRouter;


