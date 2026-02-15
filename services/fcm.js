/**
 * Firebase Cloud Messaging Service
 * Handles push notifications via Firebase Admin SDK
 */

const admin = require('firebase-admin');
const logger = require('../services/logger');

// Firebase Admin SDK initialization
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) return true;

    try {
        // Check for service account credentials
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const projectId = process.env.FIREBASE_PROJECT_ID;

        if (serviceAccountPath) {
            // Use service account file
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: projectId || serviceAccount.project_id,
            });
            logger.info('✅ Firebase Admin SDK initialized with service account');
        } else if (projectId) {
            // Use Application Default Credentials (for cloud environments)
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId: projectId,
            });
            logger.info('✅ Firebase Admin SDK initialized with ADC');
        } else {
            logger.warn('⚠️ Firebase credentials not configured. Push notifications disabled.');
            return false;
        }

        firebaseInitialized = true;
        return true;
    } catch (error) {
        logger.error('❌ Firebase initialization error:', error.message);
        return false;
    }
}

/**
 * Send push notification to specific device tokens
 * @param {string[]} tokens - FCM device tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 * @returns {Promise<{success: number, failure: number}>}
 */
async function sendToTokens(tokens, title, body, data = {}) {
    if (!initializeFirebase()) {
        return { success: 0, failure: tokens.length, error: 'Firebase not configured' };
    }

    if (!tokens || tokens.length === 0) {
        return { success: 0, failure: 0, error: 'No tokens provided' };
    }

    try {
        const message = {
            notification: {
                title: title,
                body: body,
            },
            data: data,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    },
                },
            },
        };

        // Send to each token (batch sending for efficiency)
        const responses = await Promise.allSettled(
            tokens.map(token =>
                admin.messaging().send({ ...message, token })
            )
        );

        const success = responses.filter(r => r.status === 'fulfilled').length;
        const failure = responses.filter(r => r.status === 'rejected').length;

        logger.info(`📬 FCM sent: ${success} success, ${failure} failed`);

        return { success, failure };
    } catch (error) {
        logger.error('❌ FCM send error:', error);
        return { success: 0, failure: tokens.length, error: error.message };
    }
}

/**
 * Send push notification to a topic
 * @param {string} topic - Topic name (e.g., 'all', 'news')
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
async function sendToTopic(topic, title, body, data = {}) {
    if (!initializeFirebase()) {
        return { success: false, error: 'Firebase not configured' };
    }

    try {
        // Convert data object to string format (FCM requires string values)
        const dataPayload = {};
        if (data && typeof data === 'object') {
            for (const [key, value] of Object.entries(data)) {
                dataPayload[key] = typeof value === 'string' ? value : JSON.stringify(value);
            }
        }

        const message = {
            topic: topic,
            notification: {
                title: title,
                body: body,
            },
            data: dataPayload,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    },
                },
            },
        };

        const response = await admin.messaging().send(message);
        logger.info(`📬 FCM topic message sent: ${response}`);

        return { success: true, messageId: response };
    } catch (error) {
        logger.error('❌ FCM topic send error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeFirebase,
    sendToTokens,
    sendToTopic,
};
