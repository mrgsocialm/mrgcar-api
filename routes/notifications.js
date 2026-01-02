const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');
const fcmService = require('../services/fcm');

// Factory function that creates router with injected middleware
function createNotificationsRouter(middlewares) {
    const router = express.Router();
    const { publicLimiter, adminLimiter, apiResponse } = middlewares;

    // GET /notifications - List all notifications (admin only)
    router.get('/', adminLimiter, requireAdmin, async (req, res) => {
        try {
            // For now, return empty array - can be extended to store notification history
            return apiResponse.success(res, []);
        } catch (err) {
            console.error('GET /notifications error:', err);
            return apiResponse.errors.serverError(res, 'Bildirimler yüklenirken hata oluştu');
        }
    });

    // POST /notifications/send - Send push notification (admin only)
    router.post('/send', adminLimiter, requireAdmin, async (req, res) => {
        try {
            const { title, body, topic } = req.body;

            if (!title || !body) {
                return apiResponse.errors.badRequest(res, 'Başlık ve mesaj zorunludur');
            }

            // Use FCM service to send notification
            const targetTopic = topic || 'all';
            const result = await fcmService.sendToTopic(targetTopic, {
                title,
                body,
                data: {
                    type: 'notification',
                    title,
                    body,
                },
            });

            if (result.success) {
                return apiResponse.success(res, {
                    message: 'Bildirim gönderildi',
                    sentCount: result.count || 0,
                    topic: targetTopic,
                }, 201);
            } else {
                return apiResponse.errors.serverError(res, result.error || 'Bildirim gönderilemedi');
            }
        } catch (err) {
            console.error('POST /notifications/send error:', err);
            return apiResponse.errors.serverError(res, 'Bildirim gönderilirken hata oluştu');
        }
    });

    return router;
}

module.exports = createNotificationsRouter;

