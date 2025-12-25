/**
 * Seed script for cars table
 * Reads from data/cars.js and inserts/updates into PostgreSQL
 * 
 * Usage: node scripts/seedCars.js
 * 
 * Requires: UNIQUE constraint on (make, model, variant)
 */

require('dotenv').config();

const { Pool } = require('pg');
const rawCars = require('../data/cars');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Flatten nested array if exists
function flattenCars(data) {
    if (Array.isArray(data[0]) && Array.isArray(data[0][0])) {
        return data[0];
    }
    if (Array.isArray(data[0])) {
        return data[0];
    }
    return data;
}

// Extract body_type from vehicle object or style
function extractBodyType(car) {
    if (car.vehicle?.body_type && car.vehicle.body_type.trim()) {
        return car.vehicle.body_type;
    }
    if (car.style) {
        const style = car.style.toLowerCase();
        if (style.includes('suv')) return 'SUV';
        if (style.includes('sedan')) return 'Sedan';
        if (style.includes('coupe')) return 'Coupe';
        if (style.includes('wagon')) return 'Wagon';
        if (style.includes('hatchback')) return 'Hatchback';
        if (style.includes('truck') || style.includes('pickup')) return 'Pickup';
        if (style.includes('van')) return 'Van';
        if (style.includes('convertible')) return 'Convertible';
    }
    return null;
}

// Build data object with all extra info
function buildDataObject(car) {
    const data = {};
    if (car.year) data.year = car.year;
    if (car.price) data.price = car.price;
    if (car.summary) data.summary = car.summary;
    if (car.style) data.style = car.style;
    if (car.trim) data.trim = car.trim;
    if (car.vehicle) data.vehicle = car.vehicle;
    if (car.dimensions) data.dimensions = car.dimensions;
    if (car.specifications) data.specifications = car.specifications;
    if (car.engine) data.engine = car.engine;
    if (car.fuel_economy) data.fuel_economy = car.fuel_economy;
    if (car.safety) data.safety = car.safety;
    if (car.warranty) data.warranty = car.warranty;
    return data;
}

async function seedCars() {
    console.log('🚗 Starting car seed...');
    console.log(`📦 Database: ${process.env.DATABASE_URL ? 'Connected' : 'No DATABASE_URL!'}`);

    const cars = flattenCars(rawCars);
    console.log(`📊 Found ${cars.length} cars in data source`);

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const car of cars) {
        const make = car.make || car.brand || null;
        const model = car.model || null;
        // variant defaults to '' (empty string) to match DB constraint
        const variant = car.trim_and_style || car.trim || '';

        if (!make || !model) {
            console.warn(`⚠️  Skipping car without make/model`);
            errors++;
            continue;
        }

        const bodyType = extractBodyType(car);
        const data = buildDataObject(car);

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
                console.log(`📥 Inserted: ${make} ${model} ${variant}`);
            } else {
                updated++;
                console.log(`🔄 Updated: ${make} ${model} ${variant}`);
            }
        } catch (err) {
            console.error(`❌ Error with ${make} ${model}:`, err.message);
            errors++;
        }
    }

    console.log('\n✅ Seed completed!');
    console.log(`   📥 Inserted: ${inserted}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total processed: ${inserted + updated + errors}`);

    // Verify count
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM cars');
    console.log(`\n📈 Total cars in DB: ${rows[0].count}`);

    await pool.end();
}

seedCars().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
