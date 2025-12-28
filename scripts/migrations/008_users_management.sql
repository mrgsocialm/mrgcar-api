-- 008_users_management.sql
-- Add user management fields: status, role, ban, restrictions, lastSeen

-- Add new columns to users table
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS ban_expiry TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS restrictions TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);

-- Status values: 'active', 'banned', 'restricted'
-- Role values: 'user', 'moderator', 'admin'
-- Restrictions: array of strings like ['forum', 'comments', 'uploads', 'messaging']
