/**
 * Standardized API Response Helpers
 */

// Success response
function success(res, data, status = 200) {
    return res.status(status).json({
        ok: true,
        data,
    });
}

// Success with pagination info
function successWithPagination(res, data, pagination) {
    return res.status(200).json({
        ok: true,
        data,
        pagination,
    });
}

// Error response
function error(res, code, message, status = 400, details = null) {
    const response = {
        ok: false,
        error: {
            code,
            message,
        },
    };

    if (details) {
        response.error.details = details;
    }

    return res.status(status).json(response);
}

// Common errors
const errors = {
    notFound: (res, resource = 'Kaynak') =>
        error(res, 'NOT_FOUND', `${resource} bulunamadı`, 404),

    unauthorized: (res, message = 'Yetkilendirme gerekli') =>
        error(res, 'UNAUTHORIZED', message, 401),

    forbidden: (res, message = 'Bu işlem için yetkiniz yok') =>
        error(res, 'FORBIDDEN', message, 403),

    badRequest: (res, message = 'Geçersiz istek') =>
        error(res, 'BAD_REQUEST', message, 400),

    serverError: (res, message = 'Sunucu hatası') =>
        error(res, 'SERVER_ERROR', message, 500),

    validationError: (res, details) =>
        error(res, 'VALIDATION_ERROR', 'Girdi doğrulama hatası', 400, details),
};

module.exports = {
    success,
    successWithPagination,
    error,
    errors,
};
