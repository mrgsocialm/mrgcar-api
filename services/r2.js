/**
 * Cloudflare R2 Storage Service
 * S3-compatible API for image uploads
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// R2 Configuration from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'mrgcar-images';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// Initialize S3 client for R2
const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Required for Cloudflare R2
});

/**
 * Generate a unique filename for uploads
 * @param {string} originalName - Original file name
 * @param {string} folder - Folder path (e.g., 'cars', 'news')
 * @returns {string} Unique file path
 */
function generateFileName(originalName, folder = 'uploads') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    return `${folder}/${timestamp}-${random}.${ext}`;
}

/**
 * Upload a file to R2
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} fileName - File name
 * @param {string} contentType - MIME type
 * @param {string} folder - Folder to upload to
 * @returns {Promise<{url: string, key: string}>}
 */
async function uploadFile(fileBuffer, fileName, contentType, folder = 'uploads') {
    const key = generateFileName(fileName, folder);
    
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
    });

    await r2Client.send(command);

    return {
        key,
        url: `${R2_PUBLIC_URL}/${key}`,
    };
}

/**
 * Delete a file from R2
 * @param {string} key - File key/path
 * @returns {Promise<void>}
 */
async function deleteFile(key) {
    const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
    });

    await r2Client.send(command);
}

/**
 * Generate a presigned URL for direct upload from client
 * @param {string} fileName - Original file name
 * @param {string} contentType - MIME type
 * @param {string} folder - Folder to upload to
 * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
 * @returns {Promise<{uploadUrl: string, key: string, publicUrl: string}>}
 */
async function getPresignedUploadUrl(fileName, contentType, folder = 'uploads', expiresIn = 3600) {
    const key = generateFileName(fileName, folder);

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn });

    return {
        uploadUrl,
        key,
        publicUrl: `${R2_PUBLIC_URL}/${key}`,
    };
}

/**
 * Check if R2 is properly configured
 * @returns {boolean}
 */
function isConfigured() {
    return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

module.exports = {
    uploadFile,
    deleteFile,
    getPresignedUploadUrl,
    isConfigured,
    R2_PUBLIC_URL,
    R2_BUCKET_NAME,
};

