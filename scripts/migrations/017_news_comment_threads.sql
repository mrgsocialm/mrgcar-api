-- Add reply_to_user_id column to news_comments table
ALTER TABLE news_comments ADD COLUMN IF NOT EXISTS reply_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_news_comments_reply_to_user_id ON news_comments(reply_to_user_id);
