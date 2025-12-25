/**
 * Database Migration Runner (Prod-Ready)
 * - Runs migrations in numeric order (001, 002, ...)
 * - Tracks applied migrations in schema_migrations table
 * - Skips already applied migrations
 * - Uses DATABASE_URL from .env
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Validate DATABASE_URL
if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is missing in .env');
    process.exit(1);
}

// Parse URL for logging (hide password)
let displayUrl = 'Using DATABASE_URL';
try {
    const url = new URL(process.env.DATABASE_URL);
    displayUrl = `${url.host}:${url.port || 5432}`;
} catch (e) {
    // URL parse failed, just use generic message
}

// Create pool using DATABASE_URL with SSL for Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
}

async function getAppliedMigrations() {
    const { rows } = await pool.query('SELECT filename FROM schema_migrations');
    return new Set(rows.map(r => r.filename));
}

async function markMigrationApplied(filename) {
    await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [filename]
    );
}

async function runMigrations() {
    console.log('🚀 Starting database migrations...\n');
    console.log(`📦 Database: ${displayUrl}`);
    console.log(`🔒 SSL: Enabled\n`);

    try {
        await ensureMigrationsTable();
        const applied = await getAppliedMigrations();

        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort((a, b) => {
                const numA = parseInt(a.split('_')[0], 10);
                const numB = parseInt(b.split('_')[0], 10);
                return numA - numB;
            });

        console.log(`Found ${files.length} migration files:\n`);

        let appliedCount = 0;
        let skippedCount = 0;

        for (const file of files) {
            if (applied.has(file)) {
                console.log(`⏭️  ${file} (already applied)`);
                skippedCount++;
                continue;
            }

            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            console.log(`📄 Running ${file}...`);

            try {
                await pool.query(sql);
                await markMigrationApplied(file);
                console.log(`   ✅ Success\n`);
                appliedCount++;
            } catch (err) {
                console.error(`\n❌ Migration ${file} failed:`);
                console.error(`   Error: ${err.message}`);
                process.exit(1);
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log(`✅ Migrations completed!`);
        console.log(`   Applied: ${appliedCount}`);
        console.log(`   Skipped: ${skippedCount}`);
        console.log('='.repeat(50));

    } catch (err) {
        console.error('❌ Migration runner failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
