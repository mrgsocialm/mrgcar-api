/**
 * Database Connection Pool
 * Configured for both local PostgreSQL and Supabase
 */
require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./services/logger');

// Parse DATABASE_URL or use individual params
let poolConfig;

if (process.env.DATABASE_URL) {
  // For Supabase pooler URLs, parse manually to handle dots in username
  const url = new URL(process.env.DATABASE_URL);
  poolConfig = {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1), // remove leading /
    ssl: { rejectUnauthorized: false },
  };
} else {
  poolConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'mrgcar',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  };
}

const pool = new Pool(poolConfig);

// Log connection status
pool.on('connect', () => {
  logger.info('Database connected');
});

pool.on('error', (err) => {
  logger.error('Database pool error', { error: err.message });
});

module.exports = pool;
