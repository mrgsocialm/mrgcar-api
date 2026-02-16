-- 024_cars_year_unique.sql
-- Add year column to cars table and update UNIQUE constraint to include year
-- This allows the same make+model+variant to exist for different years

-- Step 1: Add year column (extract from data JSONB)
ALTER TABLE cars ADD COLUMN IF NOT EXISTS year INTEGER;

-- Step 2: Populate year from existing data JSONB field
UPDATE cars SET year = (data->>'year')::INTEGER WHERE data->>'year' IS NOT NULL AND year IS NULL;

-- Step 3: Drop old unique constraint
ALTER TABLE cars DROP CONSTRAINT IF EXISTS cars_make_model_variant_unique;

-- Step 4: Create new unique constraint with year
ALTER TABLE cars ADD CONSTRAINT cars_make_model_variant_year_unique UNIQUE (make, model, variant, year);

-- Step 5: Add index on year for faster queries
CREATE INDEX IF NOT EXISTS idx_cars_year ON cars(year);
