/**
 * Upload Routes
 * Handles presigned URL generation for R2 uploads
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { requireAdmin } = require('../middleware/auth');
const { generatePresignedUploadUrl, getPublicUrl, isConfigured } = require('../services/r2');

function createUploadsRouter(middlewares) {
    const router = express.Router();
    const { adminLimiter, validate, presignUploadSchema, apiResponse } = middlewares;

    /**
     * POST /uploads/presign
     * Generate presigned URL for file upload
     * Body: { filename: string, contentType: string, folder?: "cars"|"news"|"sliders"|"misc" }
     */
    router.post('/presign', adminLimiter, requireAdmin, validate(presignUploadSchema), async (req, res) => {
        try {
            // Check if R2 is configured
            if (!isConfigured()) {
                return apiResponse.errors.serverError(res, 'R2 storage is not configured. Please check environment variables.');
            }

            const { filename, contentType, folder, make, model } = req.validatedBody || req.body;

            // Extract file extension (prevent path traversal)
            const ext = path.extname(filename).toLowerCase().slice(1); // Remove leading dot
            if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                return apiResponse.errors.badRequest(res, 'Invalid file extension. Allowed: jpg, jpeg, png, webp');
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
                // Default structure for other folders or cars without make/model
                key = `${folder}/${year}/${month}/${timestamp}-${random}.${ext}`;
            }

            // Generate presigned URL (expires in 60 seconds)
            const uploadUrl = await generatePresignedUploadUrl(key, contentType, 60);

            // Generate public URL
            const publicUrl = getPublicUrl(key);

            return apiResponse.success(res, {
                uploadUrl,
                publicUrl,
                key,
            });
        } catch (error) {
            console.error('POST /uploads/presign error:', error);
            return apiResponse.errors.serverError(res, `Presigned URL oluşturulurken hata oluştu: ${error.message}`);
        }
    });

    return router;
}

module.exports = createUploadsRouter;

