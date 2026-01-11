-- 011_add_banner_url.sql
-- Add banner_url column to users table

ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT NULL;


