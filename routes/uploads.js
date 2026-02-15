/**
 * Upload Routes
 * Handles presigned URL generation for R2 uploads
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { requireAdmin, requireUser } = require('../middleware/auth');
const { generatePresignedUploadUrl, getPublicUrl, isConfigured, deleteObjects, extractKeyFromPublicUrl } = require('../services/r2');
const logger = require('../services/logger');

function createUploadsRouter(middlewares) {
    const router = express.Router();
    const { adminLimiter, publicLimiter, validate, presignUploadSchema, deleteUploadSchema, apiResponse } = middlewares;

    // Helper function to check if user is admin
    function isAdmin(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return false;
        }
        const jwt = require('jsonwebtoken');
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Check if token has admin role
            return decoded.role === 'admin';
        } catch (e) {
            return false;
        }
    }

    /**
     * POST /uploads/presign
     * Generate presigned URL for file upload
     * Body: { filename: string, contentType: string, folder?: "cars"|"news"|"sliders"|"profiles"|"banners" }
     * 
     * Access control:
     * - profiles, banners: Any authenticated user
     * - cars, news, sliders: Admin only
     */
    router.post('/presign', publicLimiter, requireUser, validate(presignUploadSchema), async (req, res) => {
        try {
            // Check if R2 is configured
            if (!isConfigured()) {
                return apiResponse.errors.serverError(res, 'R2 storage is not configured. Please check environment variables.');
            }

            const { filename, contentType, folder, make, model } = req.validatedBody || req.body;

            // Validate folder (prevent path traversal and unauthorized folders)
            const ALLOWED_FOLDERS = ['cars', 'news', 'sliders', 'profiles', 'banners', 'reviews'];
            if (!ALLOWED_FOLDERS.includes(folder)) {
                return apiResponse.errors.badRequest(res, `Invalid folder. Allowed: ${ALLOWED_FOLDERS.join(', ')}`);
            }

            // Check if user has permission for this folder
            // Admin can access all folders, regular users can only access profiles and banners
            const adminFolders = ['cars', 'news', 'sliders', 'reviews'];

            if (adminFolders.includes(folder)) {
                // Check if user is admin
                if (!isAdmin(req)) {
                    return apiResponse.errors.forbidden(res, 'Bu klasör için admin yetkisi gereklidir.');
                }
            }
            // For profiles and banners, any authenticated user can access (already passed requireUser)

            // Extract file extension (prevent path traversal)
            const ext = path.extname(filename).toLowerCase().slice(1); // Remove leading dot
            if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                return apiResponse.errors.badRequest(res, 'Invalid file extension. Allowed: jpg, jpeg, png, webp');
            }

            // Additional path traversal protection: ensure filename doesn't contain path separators
            if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
                return apiResponse.errors.badRequest(res, 'Invalid filename. Path traversal not allowed.');
            }

            // Sanitize make and model for folder names (remove special chars, lowercase, replace spaces with hyphens)
            function sanitizeFolderName(str) {
                if (!str) return null;
                return str
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
                    .replace(/\s+/g, '-') // Replace spaces with hyphens
                    .replace(/-+/g, '-') // Replace multiple hyphens with single
                    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
            }

            // Generate unique key
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const timestamp = now.getTime();
            const random = crypto.randomBytes(8).toString('hex');

            let key;
            // For cars folder, organize by make/model if provided
            if (folder === 'cars' && make && model) {
                const sanitizedMake = sanitizeFolderName(make);
                const sanitizedModel = sanitizeFolderName(model);
                if (sanitizedMake && sanitizedModel) {
                    key = `${folder}/${sanitizedMake}/${sanitizedModel}/${year}/${month}/${timestamp}-${random}.${ext}`;
                } else {
                    // Fallback to default structure if sanitization fails
                    key = `${folder}/${year}/${month}/${timestamp}-${random}.${ext}`;
                }
            } else {
                // Default structure for other folders (news, sliders, profiles, banners) or cars without make/model
                // Simple structure: folder/yyyy/mm/timestamp-random.ext
                key = `${folder}/${year}/${month}/${timestamp}-${random}.${ext}`;
            }

            // Final path traversal check: ensure key doesn't contain dangerous patterns
            if (key.includes('..') || key.startsWith('/') || key.includes('\\')) {
                return apiResponse.errors.badRequest(res, 'Invalid key generated. Security check failed.');
            }

            // Generate presigned URL (expires in 60 seconds)
            const uploadUrl = await generatePresignedUploadUrl(key, contentType, 60);

            // Generate public URL
            const publicUrl = getPublicUrl(key);

            return apiResponse.success(res, {
                uploadUrl,
                publicUrl,
                key,
                maxSizeBytes: 5 * 1024 * 1024, // 5MB max
            });
        } catch (error) {
            logger.error('POST /uploads/presign error:', error);
            return apiResponse.errors.serverError(res, `Presigned URL oluşturulurken hata oluştu: ${error.message}`);
        }
    });

    /**
     * DELETE /uploads
     * Delete objects from R2 storage
     * Body: { key: string } or { keys: string[] }
     */
    router.delete('/', adminLimiter, requireAdmin, validate(deleteUploadSchema), async (req, res) => {
        try {
            // Check if R2 is configured
            if (!isConfigured()) {
                return apiResponse.errors.serverError(res, 'R2 storage is not configured. Please check environment variables.');
            }

            const { key, keys, publicUrl, publicUrls } = req.validatedBody || req.body;

            // Build list of keys to delete
            let keysToDelete = [];

            // If keys array provided, use it
            if (keys && keys.length > 0) {
                keysToDelete = keys;
            }
            // If single key provided, add it
            else if (key) {
                keysToDelete = [key];
            }
            // If publicUrls array provided, extract keys
            else if (publicUrls && publicUrls.length > 0) {
                for (const url of publicUrls) {
                    const extractedKey = extractKeyFromPublicUrl(url);
                    if (extractedKey) {
                        keysToDelete.push(extractedKey);
                    } else {
                        return apiResponse.errors.badRequest(res, `Invalid publicUrl: ${url}. Could not extract key.`);
                    }
                }
            }
            // If single publicUrl provided, extract key
            else if (publicUrl) {
                const extractedKey = extractKeyFromPublicUrl(publicUrl);
                if (extractedKey) {
                    keysToDelete = [extractedKey];
                } else {
                    return apiResponse.errors.badRequest(res, `Invalid publicUrl: ${publicUrl}. Could not extract key.`);
                }
            }

            if (keysToDelete.length === 0) {
                return apiResponse.errors.badRequest(res, 'Either "key", "keys", "publicUrl", or "publicUrls" array must be provided');
            }

            // Validate all keys (prevent path traversal)
            for (const k of keysToDelete) {
                if (k.includes('..') || k.startsWith('/') || k.includes('\\')) {
                    return apiResponse.errors.badRequest(res, `Invalid key: ${k}. Path traversal not allowed.`);
                }
            }

            // Delete objects from R2
            const result = await deleteObjects(keysToDelete);

            if (result.errors.length > 0) {
                logger.warn('Some objects failed to delete:', result.errors);
                // Still return success if at least some were deleted
                if (result.deleted.length === 0) {
                    return apiResponse.errors.serverError(res, `Failed to delete objects: ${result.errors.map(e => e.error).join(', ')}`);
                }
                return apiResponse.success(res, {
                    deleted: result.deleted,
                    errors: result.errors,
                    message: `Deleted ${result.deleted.length} object(s), ${result.errors.length} failed`,
                });
            }

            return apiResponse.success(res, {
                deleted: result.deleted,
                message: `Successfully deleted ${result.deleted.length} object(s)`,
            });
        } catch (error) {
            logger.error('DELETE /uploads error:', error);
            return apiResponse.errors.serverError(res, `Dosya silinirken hata oluştu: ${error.message}`);
        }
    });

    return router;
}

module.exports = createUploadsRouter;

