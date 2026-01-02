const express = require('express');
const pool = require('../db');

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
            console.error('POST /admin/login error:', error);
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

    return router;
}

module.exports = createAdminRouter;
