-- Migration: Add slider fields to cars and create reviews table
-- Run this on VPS: psql -d mrgcar -f scripts/migrations/010_slider_reviews.sql

-- 1. Add slider fields to cars table
ALTER TABLE cars ADD COLUMN IF NOT EXISTS show_in_slider BOOLEAN DEFAULT FALSE;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS slider_title VARCHAR(255);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS slider_subtitle VARCHAR(255);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS slider_order INTEGER DEFAULT 0;

-- 2. Create reviews table (admin reviews + user ratings)
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
);

-- 3. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_reviews_car_id ON reviews(car_id);
CREATE INDEX IF NOT EXISTS idx_reviews_featured ON reviews(is_featured, is_admin_review);
CREATE INDEX IF NOT EXISTS idx_cars_slider ON cars(show_in_slider, slider_order);

-- 4. Drop old sliders table (data will come from cars now)
-- DROP TABLE IF EXISTS sliders;
