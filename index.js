require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require("./db");

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

// Security middleware
app.use(helmet());

// CORS configuration
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
  const { body_type, created_at, updated_at, ...rest } = row;
  return {
    ...rest,
    bodyType: body_type,
    createdAt: created_at,
    updatedAt: updated_at,
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

// GET /cars?status=published|draft&limit=50&offset=0
app.get("/cars", publicLimiter, validate(listCarsQuerySchema, 'query'), async (req, res) => {
  try {
    const { status, limit, offset } = req.validatedQuery || { status: 'published', limit: 50, offset: 0 };

    // Get total count for pagination
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM cars WHERE status = $1",
      [status]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const { rows } = await pool.query(
      "SELECT * FROM cars WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [status, limit, offset]
    );

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
    const { make, model, variant, bodyType, status, data } = req.body;

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

// ---- Health Check ----
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'MRGCAR API ayakta' });
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