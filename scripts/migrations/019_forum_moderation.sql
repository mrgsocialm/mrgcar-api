-- Add is_locked column to forum_posts for moderation
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

-- Create index for locked posts
CREATE INDEX IF NOT EXISTS idx_forum_posts_locked ON forum_posts(is_locked);
