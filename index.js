// Sentry must be initialized first before any other imports
require('./instrument');
const Sentry = require("@sentry/node");

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const pool = require("./db");
const fcmService = require('./services/fcm');
const r2Service = require('./services/r2');

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'), false);
    }
  },
});

// Security & validation modules (require after npm install)
let helmet, publicLimiter, adminLimiter, authLimiter, validate, createCarSchema, updateCarSchema, listCarsQuerySchema;
let createForumPostSchema;
let apiResponse;

try {
  helmet = require('helmet');
  const rateLimitModule = require('./middleware/rateLimit');
  publicLimiter = rateLimitModule.publicLimiter;
  adminLimiter = rateLimitModule.adminLimiter;
  authLimiter = rateLimitModule.authLimiter;

  const validationModule = require('./validation/cars');
  validate = validationModule.validate;
  createCarSchema = validationModule.createCarSchema;
  updateCarSchema = validationModule.updateCarSchema;
  listCarsQuerySchema = validationModule.listCarsQuerySchema;

  apiResponse = require('./utils/response');

  // Forum validation
  const forumValidationModule = require('./validation/forum');
  createForumPostSchema = forumValidationModule.createForumPostSchema;
} catch (e) {
  console.warn('⚠️  Some security modules not installed. Run: npm install zod helmet express-rate-limit');
  // Fallback stubs
  helmet = () => (req, res, next) => next();
  publicLimiter = (req, res, next) => next();
  adminLimiter = (req, res, next) => next();
  authLimiter = (req, res, next) => next();
  validate = () => (req, res, next) => { req.validatedBody = req.body; req.validatedQuery = req.query; next(); };
  createCarSchema = {};
  updateCarSchema = {};
  listCarsQuerySchema = {};
  apiResponse = {
    success: (res, data, status = 200) => res.status(status).json({ ok: true, data }),
    successWithPagination: (res, data, pagination) => res.status(200).json({ ok: true, data, pagination }),
    errors: {
      notFound: (res, resource) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `${resource} bulunamadı` } }),
      badRequest: (res, message) => res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message } }),
      serverError: (res, message) => res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message } }),
      unauthorized: (res, message) => res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message } }),
      forbidden: (res, message) => res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message } }),
    }
  };
  createForumPostSchema = {};
}

// Static data files removed - using PostgreSQL instead
// const news = require('./data/news');
// const forumPosts = require('./data/forumPosts');
// const forumCategories = require('./data/forumCategories');

const app = express();
const PORT = process.env.PORT || 3000;

// JWT Configuration - MUST come from environment!
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is required!');
  process.exit(1);
}
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '-refresh';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Token generation functions
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

// Trust proxy (nginx) for rate limiting to work correctly
app.set('trust proxy', 1);

// CORS configuration (must come before helmet for preflight to work)
const allowedOrigins = [
  // Development
  'http://localhost:3001', // Admin panel
  'http://localhost:3002', // Admin panel alt port
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  // Production (Vultr + Cloudflare)
  'https://admin.mrgcar.com',
  'http://admin.mrgcar.com',
  'https://api.mrgcar.com',
  'http://api.mrgcar.com',
  'https://mrgcar.com',
  'https://www.mrgcar.com',
  'http://mrgcar.com',
  'http://www.mrgcar.com',
];

// CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('10.0.2.2')) {
      return callback(null, true);
    }

    // Check allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('CORS policy violation'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-admin-token'],
  optionsSuccessStatus: 200, // For legacy browser support
}));

// Security middleware (after CORS)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(express.json({ limit: '10mb' }));

// Admin JWT Secret (same as main JWT_SECRET)
const ADMIN_JWT_SECRET = JWT_SECRET;
const ADMIN_TOKEN_EXPIRY = '12h';

// Generate admin JWT token
function generateAdminToken(admin) {
  return jwt.sign(
    { adminId: admin.id, email: admin.email, role: admin.role },
    ADMIN_JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_EXPIRY }
  );
}

// Legacy admin middleware (x-admin-token header) - DEPRECATED
function requireAdminLegacy(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// New JWT-based admin middleware (Authorization: Bearer <token>)
function requireAdminJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  // Also support legacy x-admin-token during transition
  const legacyToken = req.headers["x-admin-token"];
  if (legacyToken && legacyToken === process.env.ADMIN_TOKEN) {
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Admin role required" });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Unauthorized: Token expired" });
    }
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

// Use JWT-based middleware for admin routes
const requireAdmin = requireAdminJWT;

// ---- Admin Auth ----
// POST /admin/login
app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM admin_users WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const admin = rows[0];
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateAdminToken(admin);

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      }
    });
  } catch (error) {
    console.error('POST /admin/login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/me - Verify admin token
app.get('/admin/me', requireAdmin, (req, res) => {
  res.json({
    success: true,
    admin: req.admin
  });
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'MRGCAR API ayakta' });
});

// ---- Cars ----
// Helper: DB row → response (body_type → bodyType)
function mapCarRow(row) {
  const { body_type, created_at, updated_at, show_in_slider, slider_title, slider_subtitle, slider_order, ...rest } = row;
  return {
    ...rest,
    bodyType: body_type,
    createdAt: created_at,
    updatedAt: updated_at,
    showInSlider: show_in_slider || false,
    sliderTitle: slider_title || null,
    sliderSubtitle: slider_subtitle || null,
    sliderOrder: slider_order || 0,
  };
}

// Helper: Format timestamp to relative time (e.g., "2 saat önce")
function formatTimeAgo(date) {
  if (!date) return 'Az önce';

  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Az önce';
  if (diffMins < 60) return `${diffMins} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;

  return past.toLocaleDateString('tr-TR');
}

// Helper: Cars DB row -> response
function mapCarRow(row) {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    variant: row.variant || '',
    bodyType: row.body_type || '',
    status: row.status,
    data: row.data || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper: Forum post DB row → response
function mapForumPost(row) {
  return {
    id: row.id,
    userName: row.user_name,
    title: row.title,
    description: row.description,
    content: row.content,
    category: row.category,
    categoryId: row.category_id,
    carBrand: row.car_brand,
    carModel: row.car_model,
    likes: row.likes,
    replies: row.replies,
    viewCount: row.view_count,
    time: formatTimeAgo(row.created_at),
    isPinned: row.is_pinned,
  };
}

// GET /cars/slider - Cars marked for homepage slider
app.get("/cars/slider", publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM cars 
      WHERE show_in_slider = TRUE AND status = 'published'
      ORDER BY slider_order ASC, created_at DESC
      LIMIT 10
    `);

    return apiResponse.success(res, rows.map(row => ({
      id: row.id,
      make: row.make,
      model: row.model,
      title: row.slider_title || `${row.make} ${row.model}`,
      subtitle: row.slider_subtitle || row.data?.summary || '',
      imageUrl: row.data?.imageUrls?.[0] || row.data?.imageUrl || null,
      linkType: 'car',
      linkValue: row.id.toString(),
    })));
  } catch (err) {
    console.error("GET /cars/slider error:", err);
    return apiResponse.errors.serverError(res, 'Slider verileri yüklenirken hata oluştu');
  }
});

// GET /cars?status=published|draft|all&limit=50&offset=0
app.get("/cars", publicLimiter, validate(listCarsQuerySchema, 'query'), async (req, res) => {
  try {
    const { status, limit, offset } = req.validatedQuery || { status: 'published', limit: 50, offset: 0 };

    // Build query based on status
    let countQuery, dataQuery;
    let queryParams;

    if (status === 'all') {
      // Get all cars regardless of status
      countQuery = "SELECT COUNT(*) FROM cars";
      dataQuery = "SELECT * FROM cars ORDER BY created_at DESC LIMIT $1 OFFSET $2";
      queryParams = [limit, offset];
    } else {
      // Filter by specific status
      countQuery = "SELECT COUNT(*) FROM cars WHERE status = $1";
      dataQuery = "SELECT * FROM cars WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
      queryParams = [status, limit, offset];
    }

    // Get total count for pagination
    const countResult = await pool.query(
      countQuery,
      status === 'all' ? [] : [status]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const { rows } = await pool.query(dataQuery, queryParams);

    return apiResponse.successWithPagination(res, rows.map(mapCarRow), {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    });
  } catch (err) {
    console.error("GET /cars error:", err);
    return apiResponse.errors.serverError(res, 'Araçlar yüklenirken hata oluştu');
  }
});

// POST /cars (admin korumalı)
app.post("/cars", adminLimiter, requireAdmin, validate(createCarSchema), async (req, res) => {
  try {
    const { make, model, variant, bodyType, status, data } = req.validatedBody || req.body;

    const { rows } = await pool.query(
      `INSERT INTO cars (make, model, variant, body_type, status, data)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [make, model, variant || null, bodyType || null, status || 'draft', JSON.stringify(data || {})]
    );

    return apiResponse.success(res, mapCarRow(rows[0]), 201);
  } catch (err) {
    console.error("POST /cars error:", err);
    return apiResponse.errors.serverError(res, 'Araç oluşturulurken hata oluştu');
  }
});

// GET /cars/:id
app.get("/cars/:id", publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM cars WHERE id = $1",
      [req.params.id]
    );
    if (rows.length > 0) {
      return apiResponse.success(res, mapCarRow(rows[0]));
    } else {
      return apiResponse.errors.notFound(res, 'Araç');
    }
  } catch (err) {
    console.error("GET /cars/:id error:", err);
    return apiResponse.errors.serverError(res, 'Araç yüklenirken hata oluştu');
  }
});

// PATCH /cars/:id (admin korumalı)
app.patch("/cars/:id", adminLimiter, requireAdmin, validate(updateCarSchema), async (req, res) => {
  try {
    const { make, model, variant, bodyType, status, data, showInSlider, sliderTitle, sliderSubtitle, sliderOrder } = req.body;

    // Status validation if provided
    if (status && !["published", "draft"].includes(status)) {
      return res.status(400).json({ error: "status must be 'published' or 'draft'" });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (make !== undefined) {
      updates.push(`make = $${paramIndex++}`);
      values.push(make);
    }
    if (model !== undefined) {
      updates.push(`model = $${paramIndex++}`);
      values.push(model);
    }
    if (variant !== undefined) {
      updates.push(`variant = $${paramIndex++}`);
      values.push(variant);
    }
    if (bodyType !== undefined) {
      updates.push(`body_type = $${paramIndex++}`);
      values.push(bodyType);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (data !== undefined) {
      updates.push(`data = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(data));
    }
    // Slider fields
    if (showInSlider !== undefined) {
      updates.push(`show_in_slider = $${paramIndex++}`);
      values.push(showInSlider);
    }
    if (sliderTitle !== undefined) {
      updates.push(`slider_title = $${paramIndex++}`);
      values.push(sliderTitle);
    }
    if (sliderSubtitle !== undefined) {
      updates.push(`slider_subtitle = $${paramIndex++}`);
      values.push(sliderSubtitle);
    }
    if (sliderOrder !== undefined) {
      updates.push(`slider_order = $${paramIndex++}`);
      values.push(sliderOrder);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const query = `UPDATE cars SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`;
    const { rows } = await pool.query(query, values);

    if (rows.length > 0) {
      return apiResponse.success(res, mapCarRow(rows[0]));
    } else {
      return apiResponse.errors.notFound(res, 'Araç');
    }
  } catch (err) {
    console.error("PATCH /cars/:id error:", err);
    return apiResponse.errors.serverError(res, 'Araç güncellenirken hata oluştu');
  }
});

// DELETE /cars/:id (admin korumalı)
app.delete("/cars/:id", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM cars WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (rows.length > 0) {
      return apiResponse.success(res, { message: 'Araç silindi', car: mapCarRow(rows[0]) });
    } else {
      return apiResponse.errors.notFound(res, 'Araç');
    }
  } catch (err) {
    console.error("DELETE /cars/:id error:", err);
    return apiResponse.errors.serverError(res, 'Araç silinirken hata oluştu');
  }
});

// ---- News ---- (PostgreSQL)
app.get('/news', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM news ORDER BY created_at DESC'
    );

    // Map to expected format
    const mappedNews = rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      image: row.image,
      category: row.category,
      author: row.author,
      tags: row.tags || [],
      date: formatTimeAgo(row.created_at),
      isPopular: row.is_popular,
      isFavorite: false // Client-side state
    }));

    res.json(mappedNews);
  } catch (err) {
    console.error('GET /news error:', err);
    res.status(500).json({ error: 'Haberler yüklenirken hata oluştu' });
  }
});

// GET /news/:id - Tek haber getir
app.get('/news/:id', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Haber bulunamadı' });
    }
    const row = rows[0];
    res.json({
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      image: row.image,
      category: row.category,
      author: row.author,
      tags: row.tags || [],
      date: formatTimeAgo(row.created_at),
      isPopular: row.is_popular,
    });
  } catch (err) {
    console.error('GET /news/:id error:', err);
    res.status(500).json({ error: 'Haber yüklenirken hata oluştu' });
  }
});

// POST /news - Yeni haber ekle (Admin only)
app.post('/news', requireAdmin, async (req, res) => {
  const { title, description, content, image, category, author, tags, isPopular } = req.body || {};

  if (!title || !description || !content || !category || !author) {
    return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO news (title, description, content, image, category, author, tags, is_popular)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, description, content, image || null, category, author, tags || [], isPopular || false]
    );
    return apiResponse.success(res, rows[0], 201);
  } catch (err) {
    console.error('POST /news error:', err);
    return apiResponse.errors.serverError(res, 'Haber eklenirken hata oluştu');
  }
});

// PATCH /news/:id - Haber güncelle (Admin only)
app.patch('/news/:id', requireAdmin, async (req, res) => {
  const { title, description, content, image, category, author, tags, isPopular } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE news SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        content = COALESCE($3, content),
        image = COALESCE($4, image),
        category = COALESCE($5, category),
        author = COALESCE($6, author),
        tags = COALESCE($7, tags),
        is_popular = COALESCE($8, is_popular),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [title, description, content, image, category, author, tags, isPopular, req.params.id]
    );
    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Haber');
    }
    return apiResponse.success(res, rows[0]);
  } catch (err) {
    console.error('PATCH /news/:id error:', err);
    return apiResponse.errors.serverError(res, 'Haber güncellenirken hata oluştu');
  }
});

// DELETE /news/:id - Haber sil (Admin only)
app.delete('/news/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM news WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Haber');
    }
    return apiResponse.success(res, { deleted: true, id: rows[0].id });
  } catch (err) {
    console.error('DELETE /news/:id error:', err);
    return apiResponse.errors.serverError(res, 'Haber silinirken hata oluştu');
  }
});

// ---- Forum Categories ---- (PostgreSQL)
app.get('/forum/categories', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM forum_categories ORDER BY post_count DESC'
    );

    // Map to expected format
    const mappedCategories = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      color: row.color,
      type: row.type,
      postCount: row.post_count,
      memberCount: row.member_count,
      lastActivityTime: formatTimeAgo(row.updated_at)
    }));

    res.json(mappedCategories);
  } catch (err) {
    console.error('GET /forum/categories error:', err);
    res.status(500).json({ error: 'Kategoriler yüklenirken hata oluştu' });
  }
});

// ---- Forum Posts ---- (PostgreSQL)
// Tüm postları getir
app.get('/forum/posts', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM forum_posts ORDER BY is_pinned DESC, created_at DESC'
    );
    res.json(rows.map(mapForumPost));
  } catch (err) {
    console.error('GET /forum/posts error:', err);
    res.status(500).json({ error: 'Forum postları yüklenirken hata oluştu' });
  }
});

// Popüler postları getir (en çok beğenilen)
app.get('/forum/posts/popular', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM forum_posts ORDER BY likes DESC LIMIT 5'
    );
    res.json(rows.map(mapForumPost));
  } catch (err) {
    console.error('GET /forum/posts/popular error:', err);
    res.status(500).json({ error: 'Popüler postlar yüklenirken hata oluştu' });
  }
});

// Son eklenen postları getir
app.get('/forum/posts/recent', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM forum_posts ORDER BY created_at DESC LIMIT 5'
    );
    res.json(rows.map(mapForumPost));
  } catch (err) {
    console.error('GET /forum/posts/recent error:', err);
    res.status(500).json({ error: 'Son postlar yüklenirken hata oluştu' });
  }
});

// Kategoriye göre postları getir
app.get('/forum/posts/category/:categoryId', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM forum_posts WHERE category_id = $1 ORDER BY is_pinned DESC, created_at DESC',
      [req.params.categoryId]
    );
    res.json(rows.map(mapForumPost));
  } catch (err) {
    console.error('GET /forum/posts/category error:', err);
    res.status(500).json({ error: 'Kategori postları yüklenirken hata oluştu' });
  }
});

// Yeni post oluştur
app.post('/forum/posts', publicLimiter, validate(createForumPostSchema), async (req, res) => {
  const { title, description, content, category, categoryId, userName, carBrand, carModel } = req.validatedBody || req.body || {};

  try {
    const { rows } = await pool.query(
      `INSERT INTO forum_posts (user_name, title, description, content, category, category_id, car_brand, car_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userName || 'Anonim', title, description, content, category || 'Genel Sohbet', categoryId || 'general', carBrand || null, carModel || null]
    );

    // Update category post count
    await pool.query(
      'UPDATE forum_categories SET post_count = post_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [categoryId || 'general']
    );

    return apiResponse.success(res, mapForumPost(rows[0]), 201);
  } catch (err) {
    console.error('POST /forum/posts error:', err);
    return apiResponse.errors.serverError(res, 'Post oluşturulurken hata oluştu');
  }
});

// DELETE /forum/posts/:id - Forum postunu sil (Admin only)
app.delete('/forum/posts/:id', requireAdmin, async (req, res) => {
  try {
    // Get post first to update category count
    const postResult = await pool.query('SELECT category_id FROM forum_posts WHERE id = $1', [req.params.id]);

    if (postResult.rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Forum postu');
    }

    const categoryId = postResult.rows[0].category_id;

    // Delete post
    await pool.query('DELETE FROM forum_posts WHERE id = $1', [req.params.id]);

    // Update category post count
    await pool.query(
      'UPDATE forum_categories SET post_count = GREATEST(post_count - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [categoryId]
    );

    return apiResponse.success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    console.error('DELETE /forum/posts/:id error:', err);
    return apiResponse.errors.serverError(res, 'Post silinirken hata oluştu');
  }
});

// POST /forum/posts/:id/like - Postu beğen
app.post('/forum/posts/:id/like', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE forum_posts SET likes = likes + 1 WHERE id = $1 RETURNING id, likes',
      [req.params.id]
    );
    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Forum postu');
    }
    return apiResponse.success(res, { id: rows[0].id, likes: rows[0].likes });
  } catch (err) {
    console.error('POST /forum/posts/:id/like error:', err);
    return apiResponse.errors.serverError(res, 'Beğeni eklenirken hata oluştu');
  }
});

// POST /forum/posts/:id/unlike - Beğeniyi kaldır
app.post('/forum/posts/:id/unlike', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE forum_posts SET likes = GREATEST(likes - 1, 0) WHERE id = $1 RETURNING id, likes',
      [req.params.id]
    );
    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Forum postu');
    }
    return apiResponse.success(res, { id: rows[0].id, likes: rows[0].likes });
  } catch (err) {
    console.error('POST /forum/posts/:id/unlike error:', err);
    return apiResponse.errors.serverError(res, 'Beğeni kaldırılırken hata oluştu');
  }
});

// ---- Auth ----
// User authentication with PostgreSQL persistence

// Giriş yap
app.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email ve şifre gerekli' });
  }

  try {
    // Query user from database
    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Geçersiz email veya şifre' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (isPasswordValid) {
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        },
        accessToken,
        refreshToken
      });
    } else {
      res.status(401).json({ success: false, error: 'Geçersiz email veya şifre' });
    }
  } catch (error) {
    console.error('POST /auth/login error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// Kayıt ol
app.post('/auth/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Ad, email ve şifre gerekli' });
  }

  try {
    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Bu email zaten kayıtlı' });
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert new user into database
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email, passwordHash, name]
    );

    const newUser = result.rows[0];

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('POST /auth/register error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// Kullanıcı bilgileri - JWT token doğrulaması ile
app.get('/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Token gerekli' });
  }

  // Bearer token formatını kontrol et
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ success: false, error: 'Geçersiz token formatı' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Query user from database
    const result = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token süresi dolmuş' });
    }
    return res.status(401).json({ success: false, error: 'Geçersiz token' });
  }
});

// ---- Password Reset ----
const crypto = require('crypto');
let emailService;
try {
  emailService = require('./services/email');
} catch (e) {
  console.warn('⚠️  Email service not available');
  emailService = {
    sendPasswordResetEmail: async () => ({ success: false, error: 'Email service not configured' })
  };
}

// Rate limit tracking for forgot-password (simple in-memory, use Redis in production)
const forgotPasswordAttempts = new Map();
const FORGOT_PASSWORD_LIMIT = 3; // Max attempts per hour
const FORGOT_PASSWORD_WINDOW = 60 * 60 * 1000; // 1 hour

function checkForgotPasswordLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase();
  const attempts = forgotPasswordAttempts.get(key) || [];

  // Filter attempts within the window
  const recentAttempts = attempts.filter(t => now - t < FORGOT_PASSWORD_WINDOW);

  if (recentAttempts.length >= FORGOT_PASSWORD_LIMIT) {
    return false; // Limit exceeded
  }

  // Record this attempt
  recentAttempts.push(now);
  forgotPasswordAttempts.set(key, recentAttempts);
  return true;
}

// Generate 6-digit code
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate secure reset token
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /auth/forgot-password - Request password reset
app.post('/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email gerekli' });
  }

  // Check rate limit
  if (!checkForgotPasswordLimit(email)) {
    return res.status(429).json({
      success: false,
      error: 'Çok fazla deneme. Lütfen 1 saat sonra tekrar deneyin.'
    });
  }

  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        success: true,
        message: 'Eğer bu email kayıtlıysa, şifre sıfırlama kodu gönderildi.'
      });
    }

    const user = userResult.rows[0];

    // Delete any existing unused tokens for this user
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    // Generate new code
    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save to database
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, code, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, code, expiresAt]
    );

    // Send email
    const emailResult = await emailService.sendPasswordResetEmail(email, code, user.name);

    if (!emailResult.success) {
      console.error('Failed to send reset email:', emailResult.error);
      // Still return success to prevent email enumeration
    }

    console.log(`Password reset code sent to ${email}: ${code}`); // Remove in production

    return res.json({
      success: true,
      message: 'Eğer bu email kayıtlıysa, şifre sıfırlama kodu gönderildi.'
    });
  } catch (error) {
    console.error('POST /auth/forgot-password error:', error);
    return res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// POST /auth/verify-reset-token - Verify the 6-digit code
app.post('/auth/verify-reset-token', authLimiter, async (req, res) => {
  const { email, code } = req.body || {};

  if (!email || !code) {
    return res.status(400).json({ success: false, error: 'Email ve kod gerekli' });
  }

  try {
    // Find user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Geçersiz kod' });
    }

    const userId = userResult.rows[0].id;

    // Find valid token
    const tokenResult = await pool.query(
      `SELECT id FROM password_reset_tokens 
       WHERE user_id = $1 AND code = $2 AND expires_at > NOW() AND used_at IS NULL`,
      [userId, code]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz veya süresi dolmuş kod'
      });
    }

    // Generate reset token for password change
    const resetToken = generateResetToken();
    const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update token with reset_token
    await pool.query(
      `UPDATE password_reset_tokens 
       SET reset_token = $1, expires_at = $2 
       WHERE id = $3`,
      [resetToken, tokenExpiresAt, tokenResult.rows[0].id]
    );

    return res.json({
      success: true,
      valid: true,
      resetToken,
      message: 'Kod doğrulandı. Şimdi yeni şifrenizi belirleyebilirsiniz.'
    });
  } catch (error) {
    console.error('POST /auth/verify-reset-token error:', error);
    return res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// POST /auth/reset-password - Set new password
app.post('/auth/reset-password', authLimiter, async (req, res) => {
  const { resetToken, newPassword } = req.body || {};

  if (!resetToken || !newPassword) {
    return res.status(400).json({ success: false, error: 'Token ve yeni şifre gerekli' });
  }

  // Password validation
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalı' });
  }

  try {
    // Find valid token
    const tokenResult = await pool.query(
      `SELECT prt.id, prt.user_id, u.email 
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.reset_token = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL`,
      [resetToken]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Geçersiz veya süresi dolmuş token. Lütfen tekrar deneyin.'
      });
    }

    const { id: tokenId, user_id: userId, email } = tokenResult.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );

    // Mark token as used
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [tokenId]
    );

    console.log(`Password reset successful for ${email}`);

    return res.json({
      success: true,
      message: 'Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.'
    });
  } catch (error) {
    console.error('POST /auth/reset-password error:', error);
    return res.status(500).json({ success: false, error: 'Sunucu hatası' });
  }
});

// ---- Notifications (FCM Token Management) ----

// Middleware to extract user from JWT token
async function getUserFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

// ---- Notifications ----

// GET /notifications - List sent notifications (Admin only)
app.get('/notifications', requireAdmin, async (req, res) => {
  try {
    // First, check if notifications table exists and create if not
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        target_type VARCHAR(50) DEFAULT 'all',
        target_id VARCHAR(255),
        sent_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'sent',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query(`
      SELECT id, title, body, target_type, target_id, sent_count, status, created_at 
      FROM notifications 
      ORDER BY created_at DESC 
      LIMIT 50
    `);

    return apiResponse.success(res, rows.map(row => ({
      id: row.id.toString(),
      title: row.title,
      body: row.body,
      targetType: row.target_type,
      targetId: row.target_id,
      sentCount: row.sent_count,
      status: row.status,
      createdAt: row.created_at
    })));
  } catch (err) {
    console.error('GET /notifications error:', err);
    return apiResponse.errors.serverError(res, 'Bildirimler getirilemedi');
  }
});

// POST /notifications/register - Register FCM token
app.post('/notifications/register', async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Token gerekli' } });
  }

  const { fcmToken, deviceType } = req.body || {};

  if (!fcmToken) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'FCM token gerekli' } });
  }

  try {
    // Upsert: Insert or update on conflict
    const { rows } = await pool.query(
      `INSERT INTO user_devices (user_id, fcm_token, device_type, is_active, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (fcm_token) 
       DO UPDATE SET user_id = $1, device_type = $3, is_active = TRUE, updated_at = NOW()
       RETURNING id, user_id, fcm_token, device_type, created_at`,
      [user.userId, fcmToken, deviceType || 'android']
    );

    return apiResponse.success(res, rows[0], 201);
  } catch (err) {
    console.error('POST /notifications/register error:', err);
    return apiResponse.errors.serverError(res, 'FCM token kaydedilemedi');
  }
});

// DELETE /notifications/unregister - Unregister FCM token
app.delete('/notifications/unregister', async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Token gerekli' } });
  }

  const { fcmToken } = req.body || {};

  if (!fcmToken) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'FCM token gerekli' } });
  }

  try {
    // Soft delete - just mark as inactive
    await pool.query(
      'UPDATE user_devices SET is_active = FALSE, updated_at = NOW() WHERE fcm_token = $1 AND user_id = $2',
      [fcmToken, user.userId]
    );

    return apiResponse.success(res, { unregistered: true });
  } catch (err) {
    console.error('DELETE /notifications/unregister error:', err);
    return apiResponse.errors.serverError(res, 'FCM token silinemedi');
  }
});

// POST /notifications/send - Send notification (Admin only)
app.post('/notifications/send', requireAdmin, async (req, res) => {
  const { title, body, userId, topic, data } = req.body || {};

  if (!title || !body) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Title ve body gerekli' } });
  }

  try {
    let result;
    let sentCount = 0;
    let targetType = 'all';
    let targetId = null;

    if (topic) {
      // Send to topic (e.g., 'all', 'news', 'ios', 'android')
      result = await fcmService.sendToTopic(topic, title, body, data || {});
      sentCount = result.success ? 1 : 0;
      targetType = 'topic';
      targetId = topic;
    } else {
      // Get FCM tokens from database
      let query, params;

      if (userId) {
        query = 'SELECT fcm_token FROM user_devices WHERE user_id = $1 AND is_active = TRUE AND fcm_token IS NOT NULL';
        params = [userId];
        targetType = 'user';
        targetId = userId;
      } else {
        query = 'SELECT fcm_token FROM user_devices WHERE is_active = TRUE AND fcm_token IS NOT NULL';
        params = [];
        targetType = 'all';
      }

      const { rows } = await pool.query(query, params);

      if (rows.length === 0) {
        // Save to history even if no devices
        await pool.query(
          'INSERT INTO notifications (title, body, target_type, target_id, sent_count, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [title, body, targetType, targetId, 0, 'no_devices']
        );
        return apiResponse.success(res, { sent: 0, message: 'No active devices found' });
      }

      const tokens = rows.map(r => r.fcm_token).filter(Boolean);
      result = await fcmService.sendToTokens(tokens, title, body, data || {});
      sentCount = result.success || 0;
    }

    // Save notification to history
    await pool.query(
      'INSERT INTO notifications (title, body, target_type, target_id, sent_count, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [title, body, targetType, targetId, sentCount, 'sent']
    );

    return apiResponse.success(res, {
      sent: sentCount,
      failed: result?.failure || 0,
      message: topic
        ? `Notification sent to topic '${topic}'`
        : `Notification sent to ${sentCount} device(s)`,
    });
  } catch (err) {
    console.error('POST /notifications/send error:', err);
    return apiResponse.errors.serverError(res, 'Bildirim gönderilemedi');
  }
});
// ---- News ----

// GET /news - List all news articles
app.get('/news', async (req, res) => {
  try {
    // First, check if news table exists and create if not
    await pool.query(`
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'Automotive News',
        author VARCHAR(100) DEFAULT 'Admin',
        summary TEXT,
        content TEXT,
        image_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query(`
      SELECT * FROM news 
      ORDER BY created_at DESC 
      LIMIT 100
    `);

    return apiResponse.success(res, rows.map(row => ({
      id: row.id.toString(),
      title: row.title,
      category: row.category,
      author: row.author,
      summary: row.summary,
      content: row.content,
      imageUrl: row.image_url,
      status: row.status || 'published',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })));
  } catch (err) {
    console.error('GET /news error:', err);
    return apiResponse.errors.serverError(res, 'Haberler getirilemedi');
  }
});

// GET /news/:id - Get single news article
app.get('/news/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM news WHERE id = $1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Haber bulunamadı' } });
    }

    const row = rows[0];
    return apiResponse.success(res, {
      id: row.id.toString(),
      title: row.title,
      category: row.category,
      author: row.author,
      summary: row.summary,
      content: row.content,
      imageUrl: row.image_url,
      status: row.status || 'published',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('GET /news/:id error:', err);
    return apiResponse.errors.serverError(res, 'Haber getirilemedi');
  }
});

// POST /news - Create news article (Admin only)
app.post('/news', requireAdmin, async (req, res) => {
  const { title, category, author, summary, content, imageUrl, status } = req.body || {};

  if (!title) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Başlık gerekli' } });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO news (title, category, author, summary, content, image_url, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [title, category || 'Automotive News', author || 'Admin', summary || '', content || '', imageUrl || '', status || 'published']
    );

    const row = rows[0];
    return apiResponse.success(res, {
      id: row.id.toString(),
      title: row.title,
      category: row.category,
      author: row.author,
      summary: row.summary,
      content: row.content,
      imageUrl: row.image_url,
      status: row.status,
      createdAt: row.created_at
    }, 201);
  } catch (err) {
    console.error('POST /news error:', err);
    return apiResponse.errors.serverError(res, 'Haber eklenemedi');
  }
});

// PUT /news/:id - Update news article (Admin only)
app.put('/news/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, category, author, summary, content, imageUrl, status } = req.body || {};

  try {
    const { rows } = await pool.query(
      `UPDATE news SET 
        title = COALESCE($1, title),
        category = COALESCE($2, category),
        author = COALESCE($3, author),
        summary = COALESCE($4, summary),
        content = COALESCE($5, content),
        image_url = COALESCE($6, image_url),
        status = COALESCE($7, status),
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [title, category, author, summary, content, imageUrl, status, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Haber bulunamadı' } });
    }

    const row = rows[0];
    return apiResponse.success(res, {
      id: row.id.toString(),
      title: row.title,
      category: row.category,
      author: row.author,
      summary: row.summary,
      content: row.content,
      imageUrl: row.image_url,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('PUT /news/:id error:', err);
    return apiResponse.errors.serverError(res, 'Haber güncellenemedi');
  }
});

// DELETE /news/:id - Delete news article (Admin only)
app.delete('/news/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM news WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Haber bulunamadı' } });
    }

    return apiResponse.success(res, { deleted: true, id });
  } catch (err) {
    console.error('DELETE /news/:id error:', err);
    return apiResponse.errors.serverError(res, 'Haber silinemedi');
  }
});

// ---- Users Management ----
// Helper: Map user row
function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    avatar: row.avatar_url || null,
    role: row.role || 'user',
    status: row.status || 'active',
    banExpiry: row.ban_expiry || null,
    restrictions: row.restrictions || [],
    createdAt: row.created_at,
    lastSeen: row.last_seen || row.created_at,
    isActive: row.status !== 'banned',
  };
}

// GET /users - List all users (Admin only)
app.get('/users', requireAdmin, async (req, res) => {
  try {
    const { status, role, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (role && role !== 'all') {
      query += ` AND role = $${paramIndex++}`;
      params.push(role);
    }

    query += ` ORDER BY last_seen DESC NULLS LAST, created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (status && status !== 'all') {
      countQuery += ` AND status = $${countParamIndex++}`;
      countParams.push(status);
    }
    if (role && role !== 'all') {
      countQuery += ` AND role = $${countParamIndex++}`;
      countParams.push(role);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    return apiResponse.successWithPagination(res, rows.map(mapUserRow), {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: parseInt(offset) + rows.length < total,
    });
  } catch (err) {
    console.error('GET /users error:', err);
    return apiResponse.errors.serverError(res, 'Kullanıcılar yüklenirken hata oluştu');
  }
});

// GET /users/:id - Get single user (Admin only)
app.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);

    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Kullanıcı');
    }

    return apiResponse.success(res, mapUserRow(rows[0]));
  } catch (err) {
    console.error('GET /users/:id error:', err);
    return apiResponse.errors.serverError(res, 'Kullanıcı yüklenirken hata oluştu');
  }
});

// PUT /users/:id/ban - Permanently ban user (Admin only)
app.put('/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET status = 'banned', ban_expiry = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Kullanıcı');
    }

    return apiResponse.success(res, {
      message: 'Kullanıcı kalıcı olarak engellendi',
      user: mapUserRow(rows[0])
    });
  } catch (err) {
    console.error('PUT /users/:id/ban error:', err);
    return apiResponse.errors.serverError(res, 'Ban işlemi başarısız');
  }
});

// PUT /users/:id/temp-ban - Temporarily ban user (Admin only)
app.put('/users/:id/temp-ban', requireAdmin, async (req, res) => {
  try {
    const { days = 7 } = req.body || {};
    const banExpiry = new Date(Date.now() + days * 86400000);

    const { rows } = await pool.query(
      `UPDATE users SET status = 'banned', ban_expiry = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, banExpiry]
    );

    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Kullanıcı');
    }

    return apiResponse.success(res, {
      message: `Kullanıcı ${days} gün süreyle engellendi`,
      banExpiry: banExpiry,
      user: mapUserRow(rows[0])
    });
  } catch (err) {
    console.error('PUT /users/:id/temp-ban error:', err);
    return apiResponse.errors.serverError(res, 'Geçici ban işlemi başarısız');
  }
});

// PUT /users/:id/restrict - Restrict user features (Admin only)
app.put('/users/:id/restrict', requireAdmin, async (req, res) => {
  try {
    const { restrictions = [] } = req.body || {};

    if (!Array.isArray(restrictions) || restrictions.length === 0) {
      return apiResponse.errors.badRequest(res, 'En az bir kısıtlama seçilmelidir');
    }

    // Valid restrictions: forum, comments, uploads, messaging
    const validRestrictions = ['forum', 'comments', 'uploads', 'messaging'];
    const invalidRestrictions = restrictions.filter(r => !validRestrictions.includes(r));
    if (invalidRestrictions.length > 0) {
      return apiResponse.errors.badRequest(res, `Geçersiz kısıtlama: ${invalidRestrictions.join(', ')}`);
    }

    const { rows } = await pool.query(
      `UPDATE users SET status = 'restricted', restrictions = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, restrictions]
    );

    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Kullanıcı');
    }

    return apiResponse.success(res, {
      message: 'Kullanıcı kısıtlandı',
      restrictions: restrictions,
      user: mapUserRow(rows[0])
    });
  } catch (err) {
    console.error('PUT /users/:id/restrict error:', err);
    return apiResponse.errors.serverError(res, 'Kısıtlama işlemi başarısız');
  }
});

// PUT /users/:id/unban - Remove ban from user (Admin only)
app.put('/users/:id/unban', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users SET status = 'active', ban_expiry = NULL, restrictions = '{}', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Kullanıcı');
    }

    return apiResponse.success(res, {
      message: 'Kullanıcının engeli kaldırıldı',
      user: mapUserRow(rows[0])
    });
  } catch (err) {
    console.error('PUT /users/:id/unban error:', err);
    return apiResponse.errors.serverError(res, 'Unban işlemi başarısız');
  }
});

// PUT /users/:id/role - Change user role (Admin only)
app.put('/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body || {};

    const validRoles = ['user', 'moderator', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return apiResponse.errors.badRequest(res, `Geçerli roller: ${validRoles.join(', ')}`);
    }

    const { rows } = await pool.query(
      `UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, role]
    );

    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Kullanıcı');
    }

    return apiResponse.success(res, {
      message: `Kullanıcı rolü '${role}' olarak güncellendi`,
      user: mapUserRow(rows[0])
    });
  } catch (err) {
    console.error('PUT /users/:id/role error:', err);
    return apiResponse.errors.serverError(res, 'Rol güncelleme işlemi başarısız');
  }
});

// PUT /users/:id/last-seen - Update last seen (for app usage tracking)
app.put('/users/:id/last-seen', async (req, res) => {
  try {
    await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [req.params.id]);
    return apiResponse.success(res, { message: 'Last seen updated' });
  } catch (err) {
    console.error('PUT /users/:id/last-seen error:', err);
    return apiResponse.errors.serverError(res, 'Last seen güncelenemedi');
  }
});

// ---- Sliders (Homepage) ----
// Helper: Map slider row
function mapSliderRow(row) {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || null,
    imageUrl: row.image_url,
    linkType: row.link_type || null,
    linkId: row.link_id || null,
    linkUrl: row.link_url || null,
    order: row.order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

// GET /sliders - List all sliders
app.get('/sliders', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sliders ORDER BY "order" ASC');
    return apiResponse.success(res, rows.map(mapSliderRow));
  } catch (err) {
    console.error('GET /sliders error:', err);
    return apiResponse.errors.serverError(res, 'Slider\'lar yüklenirken hata oluştu');
  }
});

// POST /sliders - Create slider (Admin only)
app.post('/sliders', requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, imageUrl, linkType, linkId, linkUrl, order, isActive } = req.body;

    if (!title || !imageUrl) {
      return apiResponse.errors.badRequest(res, 'Title ve imageUrl gerekli');
    }

    const { rows } = await pool.query(
      `INSERT INTO sliders (title, subtitle, image_url, link_type, link_id, link_url, "order", is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, subtitle || null, imageUrl, linkType || null, linkId || null, linkUrl || null, order || 0, isActive !== false]
    );

    return apiResponse.success(res, mapSliderRow(rows[0]), 201);
  } catch (err) {
    console.error('POST /sliders error:', err);
    return apiResponse.errors.serverError(res, 'Slider oluşturulamadı');
  }
});

// PUT /sliders/:id - Update slider (Admin only)
app.put('/sliders/:id', requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, imageUrl, linkType, linkId, linkUrl, order, isActive } = req.body;

    const { rows } = await pool.query(
      `UPDATE sliders SET 
        title = COALESCE($1, title),
        subtitle = $2,
        image_url = COALESCE($3, image_url),
        link_type = $4,
        link_id = $5,
        link_url = $6,
        "order" = COALESCE($7, "order"),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [title, subtitle, imageUrl, linkType, linkId, linkUrl, order, isActive, req.params.id]
    );

    if (rows.length === 0) {
      return apiResponse.errors.notFound(res, 'Slider');
    }

    return apiResponse.success(res, mapSliderRow(rows[0]));
  } catch (err) {
    console.error('PUT /sliders/:id error:', err);
    return apiResponse.errors.serverError(res, 'Slider güncellenemedi');
  }
});

// DELETE /sliders/:id - Delete slider (Admin only)
app.delete('/sliders/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM sliders WHERE id = $1', [req.params.id]);

    if (rowCount === 0) {
      return apiResponse.errors.notFound(res, 'Slider');
    }

    return apiResponse.success(res, { message: 'Slider silindi' });
  } catch (err) {
    console.error('DELETE /sliders/:id error:', err);
    return apiResponse.errors.serverError(res, 'Slider silinemedi');
  }
});

// ---- Forum Replies (Admin) ----
// GET /forum/posts/:id/replies - Get replies for a post
app.get('/forum/posts/:id/replies', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fr.*, u.name as user_name 
       FROM forum_replies fr 
       LEFT JOIN users u ON fr.user_id = u.id 
       WHERE fr.post_id = $1 
       ORDER BY fr.created_at ASC`,
      [req.params.id]
    );

    const mapped = rows.map(row => ({
      id: row.id,
      postId: row.post_id,
      userId: row.user_id,
      userName: row.user_name || 'Anonymous',
      content: row.content,
      likes: row.likes || 0,
      createdAt: row.created_at,
      isReported: row.is_reported || false,
    }));

    return apiResponse.success(res, mapped);
  } catch (err) {
    console.error('GET /forum/posts/:id/replies error:', err);
    return apiResponse.errors.serverError(res, 'Yorumlar yüklenemedi');
  }
});

// DELETE /forum/replies/:id - Delete a reply (Admin only)
app.delete('/forum/replies/:id', requireAdmin, async (req, res) => {
  try {
    // Get the post_id before deleting
    const { rows: replyRows } = await pool.query('SELECT post_id FROM forum_replies WHERE id = $1', [req.params.id]);

    if (replyRows.length === 0) {
      return apiResponse.errors.notFound(res, 'Yorum');
    }

    const postId = replyRows[0].post_id;

    // Delete the reply
    await pool.query('DELETE FROM forum_replies WHERE id = $1', [req.params.id]);

    // Update reply count on the post
    await pool.query('UPDATE forum_posts SET replies = GREATEST(0, replies - 1) WHERE id = $1', [postId]);

    return apiResponse.success(res, { message: 'Yorum silindi' });
  } catch (err) {
    console.error('DELETE /forum/replies/:id error:', err);
    return apiResponse.errors.serverError(res, 'Yorum silinemedi');
  }
});

// ---- Reviews ----

// GET /reviews/recent - Recent reviews for homepage
app.get('/reviews/recent', publicLimiter, async (req, res) => {
  try {
    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        car_id INTEGER,
        user_id INTEGER,
        is_admin_review BOOLEAN DEFAULT FALSE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(255),
        content TEXT,
        pros TEXT,
        cons TEXT,
        is_featured BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'published',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query(`
      SELECT r.*, c.make, c.model, c.data, u.name as user_name, u.avatar_url
      FROM reviews r
      LEFT JOIN cars c ON r.car_id = c.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.status = 'published'
      ORDER BY r.is_featured DESC, r.created_at DESC
      LIMIT 10
    `);

    return apiResponse.success(res, rows.map(row => ({
      id: row.id,
      carId: row.car_id,
      carName: row.make && row.model ? `${row.make} ${row.model}` : 'Araç',
      carImage: row.data?.imageUrls?.[0] || row.data?.imageUrl || null,
      userId: row.user_id,
      userName: row.user_name || 'Anonim',
      userAvatar: row.avatar_url,
      isAdminReview: row.is_admin_review,
      rating: row.rating,
      title: row.title,
      content: row.content,
      pros: row.pros,
      cons: row.cons,
      isFeatured: row.is_featured,
      createdAt: row.created_at,
      time: formatTimeAgo(row.created_at)
    })));
  } catch (err) {
    console.error('GET /reviews/recent error:', err);
    return apiResponse.errors.serverError(res, 'İncelemeler yüklenemedi');
  }
});

// GET /reviews/car/:carId - Reviews for a specific car
app.get('/reviews/car/:carId', publicLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, u.name as user_name, u.avatar_url
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.car_id = $1 AND r.status = 'published'
      ORDER BY r.is_admin_review DESC, r.is_featured DESC, r.created_at DESC
    `, [req.params.carId]);

    return apiResponse.success(res, rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name || 'Anonim',
      userAvatar: row.avatar_url,
      isAdminReview: row.is_admin_review,
      rating: row.rating,
      title: row.title,
      content: row.content,
      pros: row.pros,
      cons: row.cons,
      isFeatured: row.is_featured,
      createdAt: row.created_at,
      time: formatTimeAgo(row.created_at)
    })));
  } catch (err) {
    console.error('GET /reviews/car/:carId error:', err);
    return apiResponse.errors.serverError(res, 'İncelemeler yüklenemedi');
  }
});

// POST /reviews - Add review (authenticated users)
app.post('/reviews', async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Giriş yapmalısınız' } });
  }

  const { carId, rating, title, content, pros, cons } = req.body || {};

  if (!carId || !rating) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Araç ve puan gerekli' } });
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO reviews (car_id, user_id, rating, title, content, pros, cons, is_admin_review, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 'published')
      RETURNING *
    `, [carId, user.userId, rating, title || '', content || '', pros || '', cons || '']);

    return apiResponse.success(res, rows[0], 201);
  } catch (err) {
    console.error('POST /reviews error:', err);
    return apiResponse.errors.serverError(res, 'İnceleme eklenemedi');
  }
});

// POST /reviews/admin - Add admin review (admin only)
app.post('/reviews/admin', requireAdmin, async (req, res) => {
  const { carId, rating, title, content, pros, cons, isFeatured } = req.body || {};

  if (!carId || !title) {
    return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Araç ve başlık gerekli' } });
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO reviews (car_id, user_id, rating, title, content, pros, cons, is_admin_review, is_featured, status)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, TRUE, $7, 'published')
      RETURNING *
    `, [carId, rating || 5, title, content || '', pros || '', cons || '', isFeatured || false]);

    return apiResponse.success(res, rows[0], 201);
  } catch (err) {
    console.error('POST /reviews/admin error:', err);
    return apiResponse.errors.serverError(res, 'Admin incelemesi eklenemedi');
  }
});

// DELETE /reviews/:id - Delete review (admin only)
app.delete('/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rowCount === 0) {
      return apiResponse.errors.notFound(res, 'İnceleme');
    }

    return apiResponse.success(res, { deleted: true });
  } catch (err) {
    console.error('DELETE /reviews/:id error:', err);
    return apiResponse.errors.serverError(res, 'İnceleme silinemedi');
  }
});

// ---- Health Check ----
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'MRGCAR API ayakta' });
});

// ---- Sentry Error Handler ----
// This must be the last middleware, catches all errors
Sentry.setupExpressErrorHandler(app);

// Optional: Custom error handler after Sentry
app.use((err, req, res, _next) => {
  // Sentry ID for debugging
  const sentryId = res.sentry;
  console.error('Unhandled error:', err);

  res.status(500).json({
    ok: false,
    error: {
      code: 'SERVER_ERROR',
      message: 'Beklenmedik bir hata oluştu',
      sentryId: sentryId || undefined,
    }
  });
});

// Sentry Test Endpoint (only for testing - triggers a test error)
app.get("/sentry-test", (req, res) => {
  throw new Error("Sentry test error - this is intentional!");
});

// =============================================================================
// IMAGE UPLOAD ENDPOINTS (R2)
// =============================================================================

// POST /upload - Direct file upload (Admin only)
app.post('/upload', adminLimiter, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!r2Service.isConfigured()) {
      return res.status(500).json({ ok: false, error: 'R2 not configured' });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'file missing' });
    }

    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
    const folder = req.body.folder || 'uploads';
    const key = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

    const result = await r2Service.uploadFile(
      req.file.buffer,
      key,
      req.file.mimetype
    );

    return res.json({ ok: true, key: result.key, url: result.url });
  } catch (err) {
    console.error('UPLOAD_ERR:', err);
    return res.status(500).json({ ok: false, error: 'upload failed', detail: String(err?.name || err) });
  }
});

// POST /upload/presigned - Get presigned URL for client-side upload (Admin only)
app.post('/upload/presigned', adminLimiter, requireAdmin, async (req, res) => {
  try {
    if (!r2Service.isConfigured()) {
      return apiResponse.errors.serverError(res, 'Image storage not configured');
    }

    const { fileName, contentType, folder } = req.body;

    if (!fileName || !contentType) {
      return apiResponse.errors.badRequest(res, 'fileName and contentType are required');
    }

    const result = await r2Service.getPresignedUploadUrl(
      fileName,
      contentType,
      folder || 'uploads'
    );

    return apiResponse.success(res, result);
  } catch (err) {
    console.error('POST /upload/presigned error:', err);
    return apiResponse.errors.serverError(res, 'Failed to generate upload URL');
  }
});

// DELETE /upload/:folder/:filename - Delete an uploaded file (Admin only)
app.delete('/upload/:folder/:filename', adminLimiter, requireAdmin, async (req, res) => {
  try {
    if (!r2Service.isConfigured()) {
      return apiResponse.errors.serverError(res, 'Image storage not configured');
    }

    const key = `${req.params.folder}/${req.params.filename}`; // Reconstruct the path

    if (!key) {
      return apiResponse.errors.badRequest(res, 'File key is required');
    }

    await r2Service.deleteFile(key);

    return apiResponse.success(res, { deleted: key });
  } catch (err) {
    console.error('DELETE /upload error:', err);
    return apiResponse.errors.serverError(res, 'Failed to delete image');
  }
});

// GET /upload/status - Check R2 configuration status
app.get('/upload/status', adminLimiter, requireAdmin, (req, res) => {
  return apiResponse.success(res, {
    configured: r2Service.isConfigured(),
    bucket: r2Service.R2_BUCKET_NAME,
    publicUrl: r2Service.R2_PUBLIC_URL,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MRGCAR API http://0.0.0.0:${PORT} üzerinde çalışıyor`);
  console.log(`  - Localhost: http://localhost:${PORT}`);
  console.log(`  - Android Emulator: http://10.0.2.2:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET    /cars');
  console.log('  GET    /cars/:id');
  console.log('  POST   /cars (admin)');
  console.log('  PATCH  /cars/:id (admin)');
  console.log('  DELETE /cars/:id (admin)');
  console.log('  GET    /news');
  console.log('  GET    /forum/categories');
  console.log('  GET    /forum/posts');
  console.log('  GET    /forum/posts/popular');
  console.log('  GET    /forum/posts/recent');
  console.log('  GET    /forum/posts/category/:categoryId');
  console.log('  POST   /forum/posts');
  console.log('  POST   /auth/login');
  console.log('  POST   /auth/register');
  console.log('  GET    /auth/me');
});