-- Migration: Add user ban and restriction columns
-- Run on VPS: psql -d mrgcar -f scripts/migrations/013_user_ban_columns.sql

-- Add ban_expiry column for temporary bans
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_expiry TIMESTAMP;

-- Add restrictions column (JSON array of restricted features)
ALTER TABLE users ADD COLUMN IF NOT EXISTS restrictions TEXT;

-- Create index for finding temp-banned users whose ban has expired
CREATE INDEX IF NOT EXISTS idx_users_ban_expiry ON users(ban_expiry) WHERE ban_expiry IS NOT NULL;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
