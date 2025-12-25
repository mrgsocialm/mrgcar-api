/**
 * Seed script for Turkish market cars
 * Extracted from Flutter's CarDatabase
 * 
 * Usage: node scripts/seedCarsTurkish.js
 */

require('dotenv').config();

const { Pool } = require('pg');
const cars = require('../data/carsTurkish');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function seedCarsTurkish() {
    console.log('🚗 Starting Turkish car seed...');
    console.log(`📦 Database: ${process.env.DATABASE_URL ? 'Connected' : 'No DATABASE_URL!'}`);
    console.log(`📊 Found ${cars.length} Turkish cars`);

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const car of cars) {
        const make = car.make;
        const model = car.model;
        const variant = car.trim_and_style || '';
        const bodyType = car.vehicle?.body_type || 'Sedan';

        // Build data object with all specifications
        const data = {
            year: car.year,
            price: car.price,
            summary: car.summary,
            style: car.style,
            trim: car.trim,
            specifications: car.specifications,
            imageUrls: car.imageUrls,
            performanceData: car.performanceData,
            efficiencyData: car.efficiencyData,
        };

        try {
            // Upsert using ON CONFLICT
            const result = await pool.query(
                `INSERT INTO cars (make, model, variant, body_type, status, data)
                 VALUES ($1, $2, $3, $4, 'published', $5::jsonb)
                 ON CONFLICT (make, model, variant) 
                 DO UPDATE SET 
                   body_type = EXCLUDED.body_type,
                   data = EXCLUDED.data,
                   updated_at = NOW()
                 RETURNING (xmax = 0) AS is_insert`,
                [make, model, variant, bodyType, JSON.stringify(data)]
            );

            if (result.rows[0].is_insert) {
                inserted++;
                console.log(`📥 Inserted: ${make} ${model}`);
            } else {
                updated++;
                console.log(`🔄 Updated: ${make} ${model}`);
            }
        } catch (err) {
            console.error(`❌ Error with ${make} ${model}:`, err.message);
            errors++;
        }
    }

    console.log('\n✅ Turkish car seed completed!');
    console.log(`   📥 Inserted: ${inserted}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Errors: ${errors}`);

    // Verify count
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM cars');
    console.log(`\n📈 Total cars in DB: ${rows[0].count}`);

    await pool.end();
}

seedCarsTurkish().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
