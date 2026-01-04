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
                    COALESCE(status != 'banned', true) as is_active,
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
                    COALESCE(status != 'banned', true) as is_active,
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

    return router;
}

module.exports = createUsersRouter;

