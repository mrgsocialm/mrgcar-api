-- Migration: Add nested replies support (parent_id column)
-- Run on VPS: psql -d mrgcar -f scripts/migrations/014_nested_replies.sql

-- Add parent_id column to forum_replies for nested/threaded replies
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE;

-- Add parent_id column to news_comments for nested/threaded comments
ALTER TABLE news_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES news_comments(id) ON DELETE CASCADE;

-- Create indexes for efficient parent lookup
CREATE INDEX IF NOT EXISTS idx_forum_replies_parent_id ON forum_replies(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_comments_parent_id ON news_comments(parent_id) WHERE parent_id IS NOT NULL;
