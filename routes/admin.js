const express = require('express');
const pool = require('../db');
const logger = require('../services/logger');

// Factory function that creates admin router with injected dependencies
function createAdminRouter(deps) {
    const router = express.Router();
    const { bcrypt, generateAdminToken, requireAdmin } = deps;

    // POST /admin/login
    router.post('/login', async (req, res) => {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        try {
            const { rows } = await pool.query(
                'SELECT * FROM admin_users WHERE email = $1',
                [email]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const admin = rows[0];
            const isValidPassword = await bcrypt.compare(password, admin.password_hash);

            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const token = generateAdminToken(admin);

            // Set httpOnly cookie for browser admin panel
            const IS_PROD = process.env.NODE_ENV === 'production';
            res.cookie('admin_token', token, {
                httpOnly: true,
                secure: IS_PROD,
                sameSite: IS_PROD ? 'none' : 'lax',
                domain: IS_PROD ? '.mrgcar.com' : undefined,
                maxAge: 12 * 60 * 60 * 1000, // 12 hours
                path: '/',
            });

            res.json({
                success: true,
                token,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    role: admin.role,
                }
            });
        } catch (error) {
            logger.error('POST /admin/login error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /admin/me - Verify admin token
    router.get('/me', requireAdmin, (req, res) => {
        res.json({
            success: true,
            admin: req.admin
        });
    });

    // GET /admin/activity-logs - Get admin activity logs
    router.get('/activity-logs', requireAdmin, async (req, res) => {
        try {
            const { limit = 50, offset = 0, entityType, action } = req.query;

            let query = 'SELECT * FROM activity_logs';
            const params = [];
            const conditions = [];
            let paramIndex = 1;

            if (entityType) {
                conditions.push(`entity_type = $${paramIndex++}`);
                params.push(entityType);
            }
            if (action) {
                conditions.push(`action = $${paramIndex++}`);
                params.push(action);
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            params.push(parseInt(limit), parseInt(offset));

            const { rows } = await pool.query(query, params);

            // Also get total count
            let countQuery = 'SELECT COUNT(*) FROM activity_logs';
            const countParams = [];
            const countConditions = [];
            let countIndex = 1;
            if (entityType) {
                countConditions.push(`entity_type = $${countIndex++}`);
                countParams.push(entityType);
            }
            if (action) {
                countConditions.push(`action = $${countIndex++}`);
                countParams.push(action);
            }
            if (countConditions.length > 0) {
                countQuery += ' WHERE ' + countConditions.join(' AND ');
            }
            const countResult = await pool.query(countQuery, countParams);

            res.json({
                success: true,
                data: rows.map(row => ({
                    id: row.id,
                    adminId: row.admin_id,
                    adminEmail: row.admin_email,
                    action: row.action,
                    entityType: row.entity_type,
                    entityId: row.entity_id,
                    details: row.details,
                    ipAddress: row.ip_address,
                    createdAt: row.created_at,
                })),
                total: parseInt(countResult.rows[0].count),
            });
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') logger.error('GET /admin/activity-logs error:', err);
            res.status(500).json({ error: 'Activity logs could not be loaded' });
        }
    });

    return router;
}

module.exports = createAdminRouter;
