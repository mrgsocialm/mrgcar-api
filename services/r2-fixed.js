/**
 * Cloudflare R2 Storage Service - CORRECT IMPLEMENTATION
 * S3-compatible API for image uploads
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'mrgcar-images';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// CORRECT S3 Client Configuration for Cloudflare R2
const r2Client = new S3Client({
    region: 'auto', // MUST be 'auto' for Cloudflare R2
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, // NO bucket name here!
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID, // S3 Access Key (NOT Cloudflare API token)
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // REQUIRED for Cloudflare R2
});

/**
 * Upload file to R2
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} fileName - Original file name
 * @param {string} contentType - MIME type
 * @param {string} folder - Folder to upload to
 * @returns {Promise<{url: string, key: string}>}
 */
async function uploadFile(fileBuffer, fileName, contentType, folder = 'uploads') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const key = `${folder}/${timestamp}-${random}.${ext}`;
    
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME, // Bucket name goes HERE, not in endpoint!
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
    });

    await r2Client.send(command);

    return {
        key,
        url: `${R2_PUBLIC_URL}/${key}`, // Public URL for accessing the file
    };
}

/**
 * Check if R2 is properly configured
 */
function isConfigured() {
    return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

module.exports = {
    uploadFile,
    isConfigured,
    R2_PUBLIC_URL,
    R2_BUCKET_NAME,
};

