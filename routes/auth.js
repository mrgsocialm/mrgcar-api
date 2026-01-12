const express = require('express');
const crypto = require('crypto');
const pool = require('../db');

// Factory function that creates router with injected dependencies
function createAuthRouter(deps) {
    const router = express.Router();
    const {
        authLimiter,
        bcrypt,
        jwt,
        JWT_SECRET,
        JWT_REFRESH_SECRET,
        generateAccessToken,
        generateRefreshToken,
        emailService
    } = deps;

    // Rate limit tracking for forgot-password
    const forgotPasswordAttempts = new Map();
    const FORGOT_PASSWORD_LIMIT = 3;
    const FORGOT_PASSWORD_WINDOW = 60 * 60 * 1000; // 1 hour

    function checkForgotPasswordLimit(email) {
        const now = Date.now();
        const key = email.toLowerCase();
        const attempts = forgotPasswordAttempts.get(key) || [];
        const recentAttempts = attempts.filter(t => now - t < FORGOT_PASSWORD_WINDOW);

        if (recentAttempts.length >= FORGOT_PASSWORD_LIMIT) {
            return false;
        }

        recentAttempts.push(now);
        forgotPasswordAttempts.set(key, recentAttempts);
        return true;
    }

    function generateResetCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function generateResetToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // POST /auth/login
    router.post('/login', authLimiter, async (req, res) => {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email ve şifre gerekli' });
        }

        try {
            const result = await pool.query(
                'SELECT id, email, name, password_hash, avatar_url, banner_url FROM users WHERE email = $1',
                [email]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'Geçersiz email veya şifre' });
            }

            const user = result.rows[0];
            const isPasswordValid = await bcrypt.compare(password, user.password_hash);

            if (isPasswordValid) {
                const accessToken = generateAccessToken(user);
                const refreshToken = generateRefreshToken(user);

                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        avatar_url: user.avatar_url,
                        banner_url: user.banner_url
                    },
                    accessToken,
                    refreshToken
                });
            } else {
                res.status(401).json({ success: false, error: 'Geçersiz email veya şifre' });
            }
        } catch (error) {
            console.error('POST /auth/login error:', error);
            res.status(500).json({ success: false, error: 'Sunucu hatası' });
        }
    });

    // POST /auth/register
    router.post('/register', authLimiter, async (req, res) => {
        const { name, email, password } = req.body || {};

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Ad, email ve şifre gerekli' });
        }

        try {
            const existingUser = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                [email]
            );

            if (existingUser.rows.length > 0) {
                return res.status(409).json({ success: false, error: 'Bu email zaten kayıtlı' });
            }

            const passwordHash = await bcrypt.hash(password, 10);

            const result = await pool.query(
                'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
                [email, passwordHash, name]
            );

            const newUser = result.rows[0];
            const accessToken = generateAccessToken(newUser);
            const refreshToken = generateRefreshToken(newUser);

            res.status(201).json({
                success: true,
                user: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email
                },
                accessToken,
                refreshToken
            });
        } catch (error) {
            console.error('POST /auth/register error:', error);
            res.status(500).json({ success: false, error: 'Sunucu hatası' });
        }
    });

    // GET /auth/me
    router.get('/me', async (req, res) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ success: false, error: 'Token gerekli' });
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ success: false, error: 'Geçersiz token formatı' });
        }

        const token = parts[1];

        try {
            const decoded = jwt.verify(token, JWT_SECRET);

            const result = await pool.query(
                'SELECT id, email, name, created_at, avatar_url, banner_url FROM users WHERE id = $1',
                [decoded.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
            }

            const user = result.rows[0];

            res.json({
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    avatar_url: user.avatar_url,
                    banner_url: user.banner_url,
                }
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, error: 'Token süresi dolmuş' });
            }
            return res.status(401).json({ success: false, error: 'Geçersiz token' });
        }
    });

    // PATCH /auth/profile - Kullanıcı kendi profilini günceller
    router.patch('/profile', authLimiter, async (req, res) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ success: false, error: 'Token gerekli' });
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ success: false, error: 'Geçersiz token formatı' });
        }

        const token = parts[1];

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const userId = decoded.userId;

            const { name, avatar_url, banner_url } = req.body || {};

            // Build update query dynamically
            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (name !== undefined && name !== null) {
                updates.push(`name = $${paramIndex++}`);
                values.push(name);
            }
            if (avatar_url !== undefined) {
                updates.push(`avatar_url = $${paramIndex++}`);
                values.push(avatar_url);
            }
            if (banner_url !== undefined) {
                updates.push(`banner_url = $${paramIndex++}`);
                values.push(banner_url);
            }

            if (updates.length === 0) {
                return res.status(400).json({ success: false, error: 'Güncellenecek alan belirtilmedi' });
            }

            updates.push(`updated_at = NOW()`);
            values.push(userId);

            const query = `
                UPDATE users 
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING id, email, name, avatar_url, banner_url, created_at
            `;

            const { rows } = await pool.query(query, values);

            if (rows.length > 0) {
                return res.json({
                    success: true,
                    user: rows[0]
                });
            } else {
                return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
            }
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, error: 'Token süresi dolmuş' });
            }
            console.error('PATCH /auth/profile error:', error);
            return res.status(500).json({ success: false, error: 'Sunucu hatası' });
        }
    });

    // POST /auth/forgot-password
    router.post('/forgot-password', authLimiter, async (req, res) => {
        const { email } = req.body || {};

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email gerekli' });
        }

        if (!checkForgotPasswordLimit(email)) {
            return res.status(429).json({
                success: false,
                error: 'Çok fazla deneme. Lütfen 1 saat sonra tekrar deneyin.'
            });
        }

        try {
            const userResult = await pool.query(
                'SELECT id, name, email FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (userResult.rows.length === 0) {
                console.log(`Password reset requested for non-existent email: ${email}`);
                return res.json({
                    success: true,
                    message: 'Eğer bu email kayıtlıysa, şifre sıfırlama kodu gönderildi.'
                });
            }

            const user = userResult.rows[0];

            await pool.query(
                'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL',
                [user.id]
            );

            const code = generateResetCode();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            await pool.query(
                `INSERT INTO password_reset_tokens (user_id, code, expires_at) VALUES ($1, $2, $3)`,
                [user.id, code, expiresAt]
            );

            if (emailService) {
                const emailResult = await emailService.sendPasswordResetEmail(email, code, user.name);
                if (!emailResult.success) {
                    console.error('Failed to send reset email:', emailResult.error);
                    // DEBUG: Return error to client to visualize the problem
                    return res.status(500).json({
                        success: false,
                        error: 'Email gönderilemedi: ' + (typeof emailResult.error === 'object' ? JSON.stringify(emailResult.error) : emailResult.error)
                    });
                }
            }

            console.log(`Password reset code sent to ${email}: ${code}`);

            return res.json({
                success: true,
                message: 'Eğer bu email kayıtlıysa, şifre sıfırlama kodu gönderildi.'
            });
        } catch (error) {
            console.error('POST /auth/forgot-password error:', error);
            return res.status(500).json({ success: false, error: 'Sunucu hatası' });
        }
    });

    // POST /auth/verify-reset-token
    router.post('/verify-reset-token', authLimiter, async (req, res) => {
        const { email, code } = req.body || {};

        if (!email || !code) {
            return res.status(400).json({ success: false, error: 'Email ve kod gerekli' });
        }

        try {
            const userResult = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                [email.toLowerCase()]
            );

            if (userResult.rows.length === 0) {
                return res.status(400).json({ success: false, error: 'Geçersiz kod' });
            }

            const userId = userResult.rows[0].id;

            const tokenResult = await pool.query(
                `SELECT id FROM password_reset_tokens 
         WHERE user_id = $1 AND code = $2 AND expires_at > NOW() AND used_at IS NULL`,
                [userId, code]
            );

            if (tokenResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Geçersiz veya süresi dolmuş kod'
                });
            }

            const resetToken = generateResetToken();
            const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

            await pool.query(
                `UPDATE password_reset_tokens SET reset_token = $1, expires_at = $2 WHERE id = $3`,
                [resetToken, tokenExpiresAt, tokenResult.rows[0].id]
            );

            return res.json({
                success: true,
                valid: true,
                resetToken,
                message: 'Kod doğrulandı. Şimdi yeni şifrenizi belirleyebilirsiniz.'
            });
        } catch (error) {
            console.error('POST /auth/verify-reset-token error:', error);
            return res.status(500).json({ success: false, error: 'Sunucu hatası' });
        }
    });

    // POST /auth/reset-password
    router.post('/reset-password', authLimiter, async (req, res) => {
        const { resetToken, newPassword } = req.body || {};

        if (!resetToken || !newPassword) {
            return res.status(400).json({ success: false, error: 'Token ve yeni şifre gerekli' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalı' });
        }

        try {
            const tokenResult = await pool.query(
                `SELECT prt.id, prt.user_id, u.email 
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.reset_token = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL`,
                [resetToken]
            );

            if (tokenResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Geçersiz veya süresi dolmuş token. Lütfen tekrar deneyin.'
                });
            }

            const { id: tokenId, user_id: userId, email } = tokenResult.rows[0];

            const passwordHash = await bcrypt.hash(newPassword, 10);

            await pool.query(
                'UPDATE users SET password_hash = $1 WHERE id = $2',
                [passwordHash, userId]
            );

            await pool.query(
                'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
                [tokenId]
            );

            console.log(`Password reset successful for ${email}`);

            return res.json({
                success: true,
                message: 'Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.'
            });
        } catch (error) {
            console.error('POST /auth/reset-password error:', error);
            return res.status(500).json({ success: false, error: 'Sunucu hatası' });
        }
    });

    // POST /auth/change-password - Authenticated user changes their password
    router.post('/change-password', authLimiter, async (req, res) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ success: false, error: 'Token gerekli' });
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ success: false, error: 'Geçersiz token formatı' });
        }

        const token = parts[1];

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const userId = decoded.userId;

            const { currentPassword, newPassword } = req.body || {};

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Mevcut şifre ve yeni şifre gerekli'
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'Yeni şifre en az 6 karakter olmalı'
                });
            }

            // Get current user
            const userResult = await pool.query(
                'SELECT id, email, password_hash FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
            }

            const user = userResult.rows[0];

            // Verify current password
            const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    error: 'Mevcut şifre yanlış'
                });
            }

            // Hash new password and update
            const newPasswordHash = await bcrypt.hash(newPassword, 10);
            await pool.query(
                'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
                [newPasswordHash, userId]
            );

            console.log(`Password changed successfully for user ${user.email}`);

            return res.json({
                success: true,
                message: 'Şifreniz başarıyla değiştirildi.'
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, error: 'Token süresi dolmuş' });
            }
            console.error('POST /auth/change-password error:', error);
            return res.status(500).json({ success: false, error: 'Sunucu hatası' });
        }
    });

    return router;
}

module.exports = createAuthRouter;
