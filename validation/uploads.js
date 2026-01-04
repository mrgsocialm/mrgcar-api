/**
 * Upload validation schemas
 */

const { z } = require('zod');

// Allowed content types (images only)
const ALLOWED_CONTENT_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
];

// Allowed folders
const ALLOWED_FOLDERS = ['cars', 'news', 'sliders', 'profiles', 'banners'];

/**
 * Presign upload request schema
 */
const presignUploadSchema = z.object({
    filename: z.string()
        .min(1, 'Filename is required')
        .max(255, 'Filename too long')
        .refine(
            (val) => {
                // Extract extension
                const ext = val.split('.').pop()?.toLowerCase();
                return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
            },
            { message: 'Invalid file extension. Allowed: jpg, jpeg, png, webp' }
        ),
    contentType: z.string()
        .refine(
            (val) => ALLOWED_CONTENT_TYPES.includes(val.toLowerCase()),
            { message: `Invalid content type. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}` }
        ),
    folder: z.enum(ALLOWED_FOLDERS),
    // Optional: For cars folder, organize by make/model
    make: z.string().optional(),
    model: z.string().optional(),
});

/**
 * Delete upload request schema
 */
const deleteUploadSchema = z.object({
    key: z.string().optional(),
    keys: z.array(z.string()).optional(),
    publicUrl: z.string().url().optional(),
    publicUrls: z.array(z.string().url()).optional(),
}).refine(
    (data) => data.key || (data.keys && data.keys.length > 0) || data.publicUrl || (data.publicUrls && data.publicUrls.length > 0),
    { message: 'Either "key", "keys", "publicUrl", or "publicUrls" array must be provided' }
);

module.exports = {
    presignUploadSchema,
    deleteUploadSchema,
    ALLOWED_CONTENT_TYPES,
    ALLOWED_FOLDERS,
};

