-- Migration: Add images array and expand rating to 10-point scale
-- Date: 2026-02-15

-- 1. Add images TEXT[] column
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images TEXT[];

-- 2. Migrate existing single image to images array
UPDATE reviews SET images = ARRAY[image] WHERE image IS NOT NULL AND images IS NULL;

-- 3. Drop old rating constraint if exists, add new one (1-10)
DO $$
BEGIN
    -- Remove any existing check constraint on rating
    IF EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%rating%'
    ) THEN
        EXECUTE 'ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_check';
    END IF;
END $$;

-- 4. Add new rating constraint (1-10)
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 10);
