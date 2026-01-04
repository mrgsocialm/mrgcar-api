const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Factory function that creates router with injected middleware
function createUsersRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, apiResponse } = middlewares;

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
            console.error('GET /users error:', err);
            console.error('Error details:', err.message, err.stack);
            return apiResponse.errors.serverError(res, `Kullanıcılar yüklenirken hata oluştu: ${err.message}`);
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
            console.error('GET /users/:id error:', err);
            console.error('Error details:', err.message, err.stack);
            return apiResponse.errors.serverError(res, `Kullanıcı yüklenirken hata oluştu: ${err.message}`);
        }
    });

    // PATCH /users/:id - Update user (admin only)
    router.patch('/:id', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { name, avatar_url, role, status } = req.body;

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
            console.error('PATCH /users/:id error:', err);
            return apiResponse.errors.serverError(res, `Kullanıcı güncellenirken hata oluştu: ${err.message}`);
        }
    });

    return router;
}

module.exports = createUsersRouter;

