-- Add image and author_name columns to reviews table
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS author_name VARCHAR(255);

-- Create car_images table if not exists (for backward compatibility or clean installs)
CREATE TABLE IF NOT EXISTS car_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    car_id UUID REFERENCES cars(id) ON DELETE CASCADE,
    image TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_car_images_car_id ON car_images(car_id);
