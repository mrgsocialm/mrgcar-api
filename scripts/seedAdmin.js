/**
 * Seed Admin User Script
 * Usage: node scripts/seedAdmin.js
 * 
 * Requires environment variables:
 * - ADMIN_EMAIL (default: admin@mrgcar.com)
 * - ADMIN_PASSWORD (default: admin123)
 * - DATABASE_URL
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function seedAdmin() {
    const email = process.env.ADMIN_EMAIL || 'admin@mrgcar.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    console.log('🔐 Admin user seeding started...');
    console.log(`📧 Email: ${email}`);

    try {
        // Create table if not exists
        await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Check if admin already exists
        const existing = await pool.query(
            'SELECT id FROM admin_users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            console.log('⚠️  Admin user already exists. Updating password...');
            const passwordHash = await bcrypt.hash(password, 10);
            await pool.query(
                'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE email = $2',
                [passwordHash, email]
            );
            console.log('✅ Admin password updated!');
        } else {
            // Create new admin
            const passwordHash = await bcrypt.hash(password, 10);
            await pool.query(
                'INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3)',
                [email, passwordHash, 'admin']
            );
            console.log('✅ Admin user created!');
        }

        console.log('\n🎉 Seed completed successfully!');
        console.log('   Login credentials:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);

    } catch (error) {
        console.error('❌ Seed failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

seedAdmin();
