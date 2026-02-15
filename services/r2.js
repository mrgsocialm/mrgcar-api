/**
 * Cloudflare R2 (S3-compatible) Service
 * Handles presigned URL generation for secure uploads
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../services/logger');

// R2 Configuration from environment
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;

// Initialize S3 client for R2
let s3Client = null;

function initializeR2Client() {
    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
        logger.warn('⚠️  R2 configuration missing. Upload functionality will be disabled.');
        return null;
    }

    if (s3Client) {
        return s3Client;
    }

    try {
        s3Client = new S3Client({
            region: 'auto', // R2 uses 'auto' region
            endpoint: R2_ENDPOINT,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID,
                secretAccessKey: R2_SECRET_ACCESS_KEY,
            },
            forcePathStyle: true, // R2 requires path-style URLs
        });
        logger.info('✅ R2 client initialized');
        return s3Client;
    } catch (error) {
        logger.error('❌ Failed to initialize R2 client:', error.message);
        return null;
    }
}

/**
 * Generate presigned URL for upload
 * @param {string} key - Object key (path in bucket)
 * @param {string} contentType - MIME type of the file
 * @param {number} expiresIn - URL expiration in seconds (default: 60)
 * @returns {Promise<string>} Presigned URL
 */
async function generatePresignedUploadUrl(key, contentType, expiresIn = 60) {
    const client = initializeR2Client();
    if (!client) {
        throw new Error('R2 client not initialized. Check environment variables.');
    }

    if (!R2_BUCKET) {
        throw new Error('R2_BUCKET not configured');
    }

    try {
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            ContentType: contentType,
        });

        const presignedUrl = await getSignedUrl(client, command, { expiresIn });
        return presignedUrl;
    } catch (error) {
        logger.error('❌ Failed to generate presigned URL:', error);
        throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
}

/**
 * Generate public URL for uploaded file
 * @param {string} key - Object key (path in bucket)
 * @returns {string} Public URL
 */
function getPublicUrl(key) {
    if (!R2_PUBLIC_BASE_URL) {
        throw new Error('R2_PUBLIC_BASE_URL not configured');
    }
    // Remove leading slash from key if present
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    return `${R2_PUBLIC_BASE_URL}/${cleanKey}`;
}

/**
 * Extract key from public URL
 * @param {string} publicUrl - Public URL of the file
 * @returns {string|null} Key or null if URL doesn't match
 */
function extractKeyFromPublicUrl(publicUrl) {
    if (!publicUrl || typeof publicUrl !== 'string') {
        return null;
    }

    try {
        const url = new URL(publicUrl);
        
        // Allow only our trusted hosts
        const allowedHosts = [];
        if (R2_PUBLIC_BASE_URL) {
            try {
                const baseUrlObj = new URL(R2_PUBLIC_BASE_URL);
                allowedHosts.push(baseUrlObj.hostname);
            } catch (e) {
                // Invalid base URL, skip
            }
        }
        // Also allow img.mrgcar.com (custom domain)
        allowedHosts.push('img.mrgcar.com');
        
        // Check if host is allowed
        if (!allowedHosts.includes(url.hostname)) {
            logger.warn(`Rejected publicUrl from untrusted host: ${url.hostname}`);
            return null;
        }

        // Extract pathname, remove leading slash, decode
        let key = url.pathname;
        if (key.startsWith('/')) {
            key = key.substring(1);
        }
        key = decodeURIComponent(key);
        
        // Security: prevent path traversal in extracted key
        if (key.includes('..') || key.includes('\\')) {
            logger.warn(`Rejected publicUrl with dangerous path: ${key}`);
            return null;
        }
        
        return key;
    } catch (error) {
        logger.warn(`Failed to parse publicUrl: ${publicUrl}`, error.message);
        return null;
    }
}

/**
 * Delete single object from R2
 * @param {string} key - Object key to delete
 * @returns {Promise<void>}
 */
async function deleteObject(key) {
    const client = initializeR2Client();
    if (!client) {
        throw new Error('R2 client not initialized. Check environment variables.');
    }

    if (!R2_BUCKET) {
        throw new Error('R2_BUCKET not configured');
    }

    // Security: prevent path traversal
    if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
        throw new Error('Invalid key. Path traversal not allowed.');
    }

    try {
        const command = new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        });

        await client.send(command);
        logger.info(`✅ Deleted R2 object: ${key}`);
    } catch (error) {
        logger.error(`❌ Failed to delete R2 object ${key}:`, error);
        throw new Error(`Failed to delete object: ${error.message}`);
    }
}

/**
 * Delete multiple objects from R2
 * @param {string[]} keys - Array of object keys to delete
 * @returns {Promise<{deleted: string[], errors: Array<{key: string, error: string}>}>}
 */
async function deleteObjects(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
        return { deleted: [], errors: [] };
    }

    const client = initializeR2Client();
    if (!client) {
        throw new Error('R2 client not initialized. Check environment variables.');
    }

    if (!R2_BUCKET) {
        throw new Error('R2_BUCKET not configured');
    }

    // Security: validate all keys
    for (const key of keys) {
        if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
            throw new Error(`Invalid key: ${key}. Path traversal not allowed.`);
        }
    }

    const deleted = [];
    const errors = [];

    // R2 supports up to 1000 objects per DeleteObjects call
    // For simplicity, we'll delete one by one (can be optimized later)
    for (const key of keys) {
        try {
            await deleteObject(key);
            deleted.push(key);
        } catch (error) {
            errors.push({ key, error: error.message });
        }
    }

    return { deleted, errors };
}

module.exports = {
    initializeR2Client,
    generatePresignedUploadUrl,
    getPublicUrl,
    extractKeyFromPublicUrl,
    deleteObject,
    deleteObjects,
    isConfigured: () => !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET),
};

