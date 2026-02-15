const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const logger = require('../services/logger');

// Factory function that creates router with injected middleware
function createUsersRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, validate, updateUserSchema, tempBanSchema, restrictSchema, apiResponse } = middlewares;

    // GET /users - List all users (admin only)
    router.get('/', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT 
                    id, 
                    email, 
                    name, 
                    created_at,
                    updated_at,
                    COALESCE(status, 'active') as status,
                    COALESCE(role, 'user') as role,
                    (COALESCE(status, 'active') != 'banned') as is_active,
                    last_seen,
                    avatar_url
                FROM users 
                ORDER BY created_at DESC`
            );
            return apiResponse.success(res, rows);
        } catch (err) {
            logger.error('GET /users error:', err);
            return apiResponse.errors.serverError(res, 'Kullanıcılar yüklenirken hata oluştu');
        }
    });

    // GET /users/:id - Get single user (admin only)
    router.get('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT 
                    id, 
                    email, 
                    name, 
                    created_at,
                    updated_at,
                    COALESCE(status, 'active') as status,
                    COALESCE(role, 'user') as role,
                    (COALESCE(status, 'active') != 'banned') as is_active,
                    last_seen,
                    avatar_url
                FROM users 
                WHERE id = $1`,
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, rows[0]);
            } else {
                return apiResponse.errors.notFound(res, 'Kullanıcı');
            }
        } catch (err) {
            logger.error('GET /users/:id error:', err);
            return apiResponse.errors.serverError(res, 'Kullanıcı yüklenirken hata oluştu');
        }
    });

    // PATCH /users/:id - Update user (admin only)
    router.patch('/:id', adminLimiter, requireAdmin, validate(updateUserSchema), async (req, res) => {
        try {
            const { name, avatar_url, role, status } = req.validatedBody;

            // Build update query dynamically
            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (name !== undefined) {
                updates.push(`name = $${paramIndex++}`);
                values.push(name);
            }
            if (avatar_url !== undefined) {
                updates.push(`avatar_url = $${paramIndex++}`);
                values.push(avatar_url);
            }
            if (role !== undefined) {
                updates.push(`role = $${paramIndex++}`);
                values.push(role);
            }
            if (status !== undefined) {
                updates.push(`status = $${paramIndex++}`);
                values.push(status);
            }

            if (updates.length === 0) {
                return apiResponse.errors.badRequest(res, 'Güncellenecek alan belirtilmedi');
            }

            updates.push(`updated_at = NOW()`);
            values.push(req.params.id);

            const query = `
                UPDATE users 
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING *
            `;

            const { rows } = await pool.query(query, values);

            if (rows.length > 0) {
                return apiResponse.success(res, rows[0]);
            } else {
                return apiResponse.errors.notFound(res, 'Kullanıcı');
            }
        } catch (err) {
            logger.error('PATCH /users/:id error:', err);
            return apiResponse.errors.serverError(res, `Kullanıcı güncellenirken hata oluştu: ${err.message}`);
        }
    });

    // PUT /users/:id/ban - Ban user permanently (admin only)
    router.put('/:id/ban', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                `UPDATE users SET status = 'banned', updated_at = NOW() WHERE id = $1 RETURNING id, email, name, status`,
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Kullanıcı engellendi', user: rows[0] });
            }
            return apiResponse.errors.notFound(res, 'Kullanıcı');
        } catch (err) {
            logger.error('PUT /users/:id/ban error:', err);
            return apiResponse.errors.serverError(res, 'Kullanıcı engellenirken hata oluştu');
        }
    });

    // PUT /users/:id/temp-ban - Ban user temporarily (admin only)
    router.put('/:id/temp-ban', adminLimiter, requireAdmin, validate(tempBanSchema), async (req, res) => {
        try {
            const { days } = req.validatedBody;
            const banExpiry = new Date();
            banExpiry.setDate(banExpiry.getDate() + (parseInt(days) || 7));

            const { rows } = await pool.query(
                `UPDATE users SET status = 'temp_banned', ban_expiry = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name, status, ban_expiry`,
                [banExpiry, req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: `Kullanıcı ${days} gün engellendi`, user: rows[0] });
            }
            return apiResponse.errors.notFound(res, 'Kullanıcı');
        } catch (err) {
            logger.error('PUT /users/:id/temp-ban error:', err);
            return apiResponse.errors.serverError(res, 'Geçici ban işlemi başarısız');
        }
    });

    // PUT /users/:id/restrict - Restrict user features (admin only)
    router.put('/:id/restrict', adminLimiter, requireAdmin, validate(restrictSchema), async (req, res) => {
        try {
            const { restrictions } = req.validatedBody;

            const { rows } = await pool.query(
                `UPDATE users SET status = 'restricted', restrictions = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name, status, restrictions`,
                [JSON.stringify(restrictions || []), req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Kullanıcı kısıtlandı', user: rows[0] });
            }
            return apiResponse.errors.notFound(res, 'Kullanıcı');
        } catch (err) {
            logger.error('PUT /users/:id/restrict error:', err);
            return apiResponse.errors.serverError(res, 'Kısıtlama işlemi başarısız');
        }
    });

    // PUT /users/:id/unban - Remove ban from user (admin only)
    router.put('/:id/unban', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { rows } = await pool.query(
                `UPDATE users SET status = 'active', ban_expiry = NULL, restrictions = NULL, updated_at = NOW() WHERE id = $1 RETURNING id, email, name, status`,
                [req.params.id]
            );
            if (rows.length > 0) {
                return apiResponse.success(res, { message: 'Kullanıcı engeli kaldırıldı', user: rows[0] });
            }
            return apiResponse.errors.notFound(res, 'Kullanıcı');
        } catch (err) {
            logger.error('PUT /users/:id/unban error:', err);
            return apiResponse.errors.serverError(res, 'Engel kaldırma işlemi başarısız');
        }
    });

    // DELETE /users/:id - Permanently delete user (admin only)
    router.delete('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const userId = req.params.id;

            // First check if user exists
            const userCheck = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
            if (userCheck.rows.length === 0) {
                return apiResponse.errors.notFound(res, 'Kullanıcı');
            }

            const deletedUser = userCheck.rows[0];

            // Delete user (CASCADE will handle related data if configured)
            await pool.query('DELETE FROM users WHERE id = $1', [userId]);

            logger.info(`User deleted by admin: ${deletedUser.email} (ID: ${userId})`);

            return apiResponse.success(res, {
                message: 'Kullanıcı kalıcı olarak silindi',
                deletedUser: { id: deletedUser.id, email: deletedUser.email, name: deletedUser.name }
            });
        } catch (err) {
            logger.error('DELETE /users/:id error:', err);
            return apiResponse.errors.serverError(res, 'Kullanıcı silinirken hata oluştu');
        }
    });

    return router;
}

module.exports = createUsersRouter;

