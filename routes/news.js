const express = require('express');
const pool = require('../db');
const { requireAdmin, requireUser } = require('../middleware/auth');
const { extractKeyFromPublicUrl, deleteObjects } = require('../services/r2');

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
            // First, get the news to extract image URL before deletion
            const { rows: newsRows } = await pool.query(
                'SELECT * FROM news WHERE id = $1',
                [req.params.id]
            );

            if (newsRows.length === 0) {
                return apiResponse.errors.notFound(res, 'Haber');
            }

            const news = newsRows[0];
            const imageKeys = [];

            // Extract image key from R2 public URL
            if (news.image && typeof news.image === 'string') {
                const key = extractKeyFromPublicUrl(news.image);
                if (key) imageKeys.push(key);
            }

            // Delete from database
            const { rows } = await pool.query(
                'DELETE FROM news WHERE id = $1 RETURNING *',
                [req.params.id]
            );

            if (rows.length > 0) {
                // Delete image from R2 (non-blocking, log errors but don't fail the request)
                if (imageKeys.length > 0) {
                    deleteObjects(imageKeys).catch(err => {
                        console.error('Failed to delete news image from R2:', err);
                    });
                }

                return apiResponse.success(res, { message: 'Haber silindi', news: rows[0] });
            } else {
                return apiResponse.errors.notFound(res, 'Haber');
            }
        } catch (err) {
            console.error('DELETE /news/:id error:', err);
            return apiResponse.errors.serverError(res, 'Haber silinirken hata oluştu');
        }
    });

    // ==================== COMMENTS ENDPOINTS ====================

    // GET /news/:newsId/comments - Get all comments for a news article
    router.get('/:newsId/comments', publicLimiter, async (req, res) => {
        try {
            const { newsId } = req.params;
            const { rows } = await pool.query(
                `SELECT 
                    nc.id, nc.news_id, nc.user_id, nc.user_name, nc.content, nc.likes, nc.parent_id, 
                    nc.created_at, nc.updated_at, nc.reply_to_user_id,
                    u.name as user_username, u.avatar_url as user_avatar,
                    ru.name as reply_to_username
                 FROM news_comments nc
                 LEFT JOIN users u ON nc.user_id = u.id
                 LEFT JOIN users ru ON nc.reply_to_user_id = ru.id
                 WHERE nc.news_id = $1 
                 ORDER BY nc.created_at ASC`,
                [newsId]
            );

            // Map to camelCase for frontend
            const comments = rows.map(row => ({
                id: row.id,
                newsId: row.news_id,
                userId: row.user_id,
                userName: row.user_name, // Keep existing field for compatibility
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

            return apiResponse.success(res, comments);
        } catch (err) {
            console.error('GET /news/:newsId/comments error:', err);
            return apiResponse.errors.serverError(res, 'Yorumlar yüklenirken hata oluştu');
        }
    });

    // POST /news/:newsId/comments - Create a new comment (requires auth)
    router.post('/:newsId/comments', publicLimiter, requireUser, async (req, res) => {
        try {
            const { newsId } = req.params;
            const { content, parentId } = req.body;
            const userId = req.user.userId;

            if (!content || content.trim().length === 0) {
                return apiResponse.errors.badRequest(res, 'Yorum içeriği boş olamaz');
            }

            if (content.length > 5000) {
                return apiResponse.errors.badRequest(res, 'Yorum içeriği 5000 karakterden uzun olamaz');
            }

            // Check if news exists
            const newsCheck = await pool.query('SELECT id FROM news WHERE id = $1', [newsId]);
            if (newsCheck.rows.length === 0) {
                return apiResponse.errors.notFound(res, 'Haber');
            }

            // If parentId is provided, verify parent comment exists
            let replyToUserId = null;
            if (parentId) {
                const parentCheck = await pool.query('SELECT id, user_id FROM news_comments WHERE id = $1 AND news_id = $2', [parentId, newsId]);
                if (parentCheck.rows.length === 0) {
                    return apiResponse.errors.notFound(res, 'Üst yorum');
                }
                // Set reply_to_user_id from the parent comment's author
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

            // Insert comment with optional parentId
            const { rows } = await pool.query(
                `INSERT INTO news_comments (news_id, user_id, user_name, content, parent_id, reply_to_user_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [newsId, userId, userName, content.trim(), parentId || null, replyToUserId]
            );

            const comment = {
                id: rows[0].id,
                newsId: rows[0].news_id,
                userId: rows[0].user_id,
                userName: rows[0].user_name,
                content: rows[0].content,
                likes: rows[0].likes || 0,
                parentId: rows[0].parent_id || null,
                replyToUserId: rows[0].reply_to_user_id || null,
                // For a newly created comment, we can return basic structure. 
                // Detailed objects (user, replyToUser) are usually fetched on reload or optimistic update in UI.
                createdAt: rows[0].created_at,
                updatedAt: rows[0].updated_at,
                isLiked: false,
            };

            return apiResponse.success(res, comment, 201);
        } catch (err) {
            console.error('POST /news/:newsId/comments error:', err);
            return apiResponse.errors.serverError(res, 'Yorum oluşturulurken hata oluştu');
        }
    });

    // DELETE /news/:newsId/comments/:commentId - Delete a comment (admin only)
    router.delete('/:newsId/comments/:commentId', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { newsId, commentId } = req.params;

            const { rows } = await pool.query(
                'DELETE FROM news_comments WHERE id = $1 AND news_id = $2 RETURNING *',
                [commentId, newsId]
            );

            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Yorum silindi' });
            } else {
                return apiResponse.errors.notFound(res, 'Yorum');
            }
        } catch (err) {
            console.error('DELETE /news/:newsId/comments/:commentId error:', err);
            return apiResponse.errors.serverError(res, 'Yorum silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createNewsRouter;

