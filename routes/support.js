const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/email');
const apiResponse = require('../utils/apiResponse');

/**
 * @route POST /support
 * @desc Send a support request email
 * @access Private
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return apiResponse.error(res, 'Lütfen bir mesaj yazın', 400);
        }

        const userEmail = req.user.email;
        // User name construction might depend on DB schema, assuming mapped in token or fetching DB.
        // req.user usually comes from token.
        const userName = req.user.name || (req.user.firstName ? `${req.user.firstName} ${req.user.lastName}` : null);

        const result = await emailService.sendSupportEmail(userEmail, userName, message);

        if (result.success) {
            return apiResponse.success(res, { message: 'Destek talebiniz başarıyla gönderildi' });
        } else {
            console.error('Support email failed:', result.error);
            return apiResponse.error(res, 'Destek talebi gönderilemedi. Lütfen daha sonra tekrar deneyin.', 500);
        }
    } catch (error) {
        console.error('Support route error:', error);
        return apiResponse.error(res, 'Sunucu hatası', 500);
    }
});

module.exports = router;
