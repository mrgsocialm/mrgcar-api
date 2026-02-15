const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'MRGCar API',
            version: '1.0.0',
            description: 'MRGCar otomotiv platformu REST API dokümantasyonu',
            contact: {
                name: 'MRGCar',
                url: 'https://mrgcar.com',
            },
        },
        servers: [
            {
                url: 'https://api.mrgcar.com/v1',
                description: 'Production',
            },
            {
                url: 'http://localhost:3000/v1',
                description: 'Development',
            },
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Kullanıcı JWT token (Authorization: Bearer <token>)',
                },
                AdminToken: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-admin-token',
                    description: 'Admin legacy token',
                },
                AdminBearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Admin JWT token',
                },
            },
            schemas: {
                Car: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        make: { type: 'string', example: 'BMW' },
                        model: { type: 'string', example: 'M3' },
                        year: { type: 'integer', example: 2024 },
                        status: { type: 'string', enum: ['active', 'draft', 'archived'], example: 'active' },
                        data: {
                            type: 'object',
                            properties: {
                                images: { type: 'array', items: { type: 'string' } },
                                specifications: { type: 'object', additionalProperties: { type: 'string' } },
                                features: { type: 'object' },
                                price: { type: 'string', example: '3.500.000 TL' },
                            },
                        },
                        created_at: { type: 'string', format: 'date-time' },
                        updated_at: { type: 'string', format: 'date-time' },
                    },
                },
                NewsArticle: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        title: { type: 'string' },
                        slug: { type: 'string' },
                        content: { type: 'string' },
                        excerpt: { type: 'string' },
                        image_url: { type: 'string' },
                        category: { type: 'string' },
                        status: { type: 'string', enum: ['published', 'draft'] },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                ForumPost: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        title: { type: 'string' },
                        content: { type: 'string' },
                        category: { type: 'string' },
                        user_id: { type: 'integer' },
                        reply_count: { type: 'integer' },
                        view_count: { type: 'integer' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                Review: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        car_id: { type: 'integer' },
                        user_id: { type: 'integer' },
                        rating: { type: 'number', minimum: 1, maximum: 5 },
                        title: { type: 'string' },
                        content: { type: 'string' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        avatar_url: { type: 'string' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                Slider: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        title: { type: 'string' },
                        image_url: { type: 'string' },
                        link_url: { type: 'string' },
                        order_index: { type: 'integer' },
                        active: { type: 'boolean' },
                    },
                },
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        ok: { type: 'boolean', example: true },
                        data: { type: 'object' },
                    },
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        ok: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string', example: 'NOT_FOUND' },
                                message: { type: 'string', example: 'Araç bulunamadı' },
                            },
                        },
                    },
                },
            },
        },
        paths: {
            // ═══ Cars ═══
            '/cars': {
                get: {
                    tags: ['Cars'],
                    summary: 'Araçları listele',
                    parameters: [
                        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'draft', 'archived'] } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                        { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                        { name: 'make', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: {
                        200: { description: 'Araç listesi', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
                    },
                },
                post: {
                    tags: ['Cars'],
                    summary: 'Yeni araç ekle (Admin)',
                    security: [{ AdminBearerAuth: [] }, { AdminToken: [] }],
                    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Car' } } } },
                    responses: {
                        201: { description: 'Araç oluşturuldu' },
                        401: { description: 'Yetkisiz' },
                    },
                },
            },
            '/cars/{id}': {
                get: {
                    tags: ['Cars'],
                    summary: 'Araç detayı',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Araç detayı' },
                        404: { description: 'Araç bulunamadı' },
                    },
                },
                put: {
                    tags: ['Cars'],
                    summary: 'Araç güncelle (Admin)',
                    security: [{ AdminBearerAuth: [] }],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Car' } } } },
                    responses: { 200: { description: 'Araç güncellendi' } },
                },
                delete: {
                    tags: ['Cars'],
                    summary: 'Araç sil (Admin)',
                    security: [{ AdminBearerAuth: [] }],
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Araç silindi' } },
                },
            },

            // ═══ Auth ═══
            '/auth/register': {
                post: {
                    tags: ['Auth'],
                    summary: 'Kullanıcı kaydı',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['name', 'email', 'password'],
                                    properties: {
                                        name: { type: 'string' },
                                        email: { type: 'string', format: 'email' },
                                        password: { type: 'string', minLength: 6 },
                                    },
                                }
                            }
                        },
                    },
                    responses: {
                        201: { description: 'Kayıt başarılı' },
                        400: { description: 'Geçersiz veri' },
                    },
                },
            },
            '/auth/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Kullanıcı girişi',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email', 'password'],
                                    properties: {
                                        email: { type: 'string', format: 'email' },
                                        password: { type: 'string' },
                                    },
                                }
                            }
                        },
                    },
                    responses: {
                        200: { description: 'Giriş başarılı, token döner' },
                        401: { description: 'Geçersiz kimlik bilgileri' },
                    },
                },
            },
            '/auth/google': {
                post: {
                    tags: ['Auth'],
                    summary: 'Google ile giriş',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['idToken'],
                                    properties: { idToken: { type: 'string' } },
                                }
                            }
                        },
                    },
                    responses: { 200: { description: 'Giriş başarılı' } },
                },
            },
            '/auth/me': {
                get: {
                    tags: ['Auth'],
                    summary: 'Mevcut kullanıcı bilgisi',
                    security: [{ BearerAuth: [] }],
                    responses: { 200: { description: 'Kullanıcı bilgisi' } },
                },
            },
            '/auth/profile': {
                put: {
                    tags: ['Auth'],
                    summary: 'Profil güncelle',
                    security: [{ BearerAuth: [] }],
                    responses: { 200: { description: 'Profil güncellendi' } },
                },
            },

            // ═══ Admin ═══
            '/admin/login': {
                post: {
                    tags: ['Admin'],
                    summary: 'Admin girişi',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email', 'password'],
                                    properties: {
                                        email: { type: 'string' },
                                        password: { type: 'string' },
                                    },
                                }
                            }
                        },
                    },
                    responses: { 200: { description: 'Admin token döner' } },
                },
            },

            // ═══ News ═══
            '/news': {
                get: {
                    tags: ['News'],
                    summary: 'Haberleri listele',
                    responses: { 200: { description: 'Haber listesi' } },
                },
                post: {
                    tags: ['News'],
                    summary: 'Yeni haber ekle (Admin)',
                    security: [{ AdminBearerAuth: [] }],
                    responses: { 201: { description: 'Haber oluşturuldu' } },
                },
            },
            '/news/{id}': {
                get: { tags: ['News'], summary: 'Haber detayı', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Haber detayı' } } },
                put: { tags: ['News'], summary: 'Haber güncelle (Admin)', security: [{ AdminBearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Haber güncellendi' } } },
                delete: { tags: ['News'], summary: 'Haber sil (Admin)', security: [{ AdminBearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Haber silindi' } } },
            },

            // ═══ Forum ═══
            '/forum/categories': {
                get: { tags: ['Forum'], summary: 'Forum kategorileri', responses: { 200: { description: 'Kategori listesi' } } },
            },
            '/forum/posts': {
                get: { tags: ['Forum'], summary: 'Forum gönderilerini listele', responses: { 200: { description: 'Gönderi listesi' } } },
                post: { tags: ['Forum'], summary: 'Yeni forum gönderisi', security: [{ BearerAuth: [] }], responses: { 201: { description: 'Gönderi oluşturuldu' } } },
            },
            '/forum/posts/{id}': {
                get: { tags: ['Forum'], summary: 'Forum gönderisi detayı', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Gönderi detayı' } } },
            },
            '/forum/posts/{id}/replies': {
                get: { tags: ['Forum'], summary: 'Gönderi yanıtları', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Yanıt listesi' } } },
                post: { tags: ['Forum'], summary: 'Yanıt ekle', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 201: { description: 'Yanıt oluşturuldu' } } },
            },

            // ═══ Reviews ═══
            '/reviews': {
                get: { tags: ['Reviews'], summary: 'İncelemeleri listele', responses: { 200: { description: 'İnceleme listesi' } } },
                post: { tags: ['Reviews'], summary: 'Yeni inceleme ekle', security: [{ BearerAuth: [] }], responses: { 201: { description: 'İnceleme oluşturuldu' } } },
            },
            '/reviews/featured': {
                get: { tags: ['Reviews'], summary: 'Öne çıkan incelemeler', responses: { 200: { description: 'Öne çıkan inceleme listesi' } } },
            },
            '/reviews/car/{carId}': {
                get: { tags: ['Reviews'], summary: 'Araç bazlı incelemeler', parameters: [{ name: 'carId', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'İnceleme listesi' } } },
            },

            // ═══ Sliders ═══
            '/sliders': {
                get: { tags: ['Sliders'], summary: 'Slider listesi', responses: { 200: { description: 'Slider listesi' } } },
                post: { tags: ['Sliders'], summary: 'Yeni slider ekle (Admin)', security: [{ AdminBearerAuth: [] }], responses: { 201: { description: 'Slider oluşturuldu' } } },
            },

            // ═══ Users ═══
            '/users': {
                get: { tags: ['Users'], summary: 'Kullanıcı listesi (Admin)', security: [{ AdminBearerAuth: [] }], responses: { 200: { description: 'Kullanıcı listesi' } } },
            },
            '/users/{id}': {
                get: { tags: ['Users'], summary: 'Kullanıcı detayı', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Kullanıcı detayı' } } },
            },

            // ═══ Uploads ═══
            '/uploads/presign': {
                post: { tags: ['Uploads'], summary: 'Presigned URL al', security: [{ BearerAuth: [] }, { AdminBearerAuth: [] }], responses: { 200: { description: 'Presigned URL' } } },
            },

            // ═══ Notifications ═══
            '/notifications/send': {
                post: { tags: ['Notifications'], summary: 'Push bildirim gönder (Admin)', security: [{ AdminBearerAuth: [] }], responses: { 200: { description: 'Bildirim gönderildi' } } },
            },
        },
        tags: [
            { name: 'Cars', description: 'Araç yönetimi' },
            { name: 'Auth', description: 'Kullanıcı kimlik doğrulama' },
            { name: 'Admin', description: 'Admin paneli' },
            { name: 'News', description: 'Haber yönetimi' },
            { name: 'Forum', description: 'Forum yönetimi' },
            { name: 'Reviews', description: 'Araç incelemeleri' },
            { name: 'Sliders', description: 'Ana sayfa slider yönetimi' },
            { name: 'Users', description: 'Kullanıcı yönetimi' },
            { name: 'Uploads', description: 'Dosya yükleme' },
            { name: 'Notifications', description: 'Push bildirimleri' },
        ],
    },
    apis: [], // We define paths inline above
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
