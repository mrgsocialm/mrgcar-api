-- 005_fix_users_uuid_and_fks.sql
-- Standardize users.id to UUID and add proper foreign keys
-- Note: This is a destructive migration - drops existing users table (no prod data assumed)

-- Ensure gen_random_uuid() works
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing users table and recreate with UUID
-- FK'ler olmadığı için doğrudan drop edebiliriz
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Alter forum_posts.user_id to proper UUID type (already UUID, just ensure consistency)
-- Then add FK to users table
-- ON DELETE SET NULL: Kullanıcı silinirse post'lar kalsın ama user_id null olsun
ALTER TABLE forum_posts 
    ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

ALTER TABLE forum_posts
    DROP CONSTRAINT IF EXISTS fk_forum_posts_user;

ALTER TABLE forum_posts
    ADD CONSTRAINT fk_forum_posts_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Same for forum_replies
ALTER TABLE forum_replies 
    ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

ALTER TABLE forum_replies
    DROP CONSTRAINT IF EXISTS fk_forum_replies_user;

ALTER TABLE forum_replies
    ADD CONSTRAINT fk_forum_replies_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
