/**
 * Activity Logger Middleware
 * Records admin actions to the activity_logs table
 */

const pool = require('../db');
const logger = require('../services/logger');

/**
 * Log an admin action
 * @param {object} params
 * @param {string} params.adminId - Admin user ID
 * @param {string} params.adminEmail - Admin email
 * @param {string} params.action - Action type (e.g., 'create', 'update', 'delete')
 * @param {string} params.entityType - Entity type (e.g., 'car', 'news', 'forum_post')
 * @param {string} [params.entityId] - Entity ID
 * @param {object} [params.details] - Additional details
 * @param {string} [params.ipAddress] - Request IP address
 */
async function logActivity({ adminId, adminEmail, action, entityType, entityId, details, ipAddress }) {
    try {
        await pool.query(
            `INSERT INTO activity_logs (admin_id, admin_email, action, entity_type, entity_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [adminId, adminEmail, action, entityType, entityId || null, details ? JSON.stringify(details) : null, ipAddress || null]
        );
    } catch (err) {
        // Don't fail the request if logging fails
        if (process.env.NODE_ENV !== 'production') {
            logger.error('Activity log error:', err);
        }
    }
}

/**
 * Express middleware that adds logActivity to the request object
 */
function activityLoggerMiddleware(req, res, next) {
    req.logActivity = async (action, entityType, entityId, details) => {
        const admin = req.admin || {};
        await logActivity({
            adminId: admin.adminId || admin.id || 'unknown',
            adminEmail: admin.email || 'unknown',
            action,
            entityType,
            entityId,
            details,
            ipAddress: req.ip || req.connection?.remoteAddress,
        });
    };
    next();
}

module.exports = { logActivity, activityLoggerMiddleware };
