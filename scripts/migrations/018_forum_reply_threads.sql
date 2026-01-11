-- Add reply_to_user_id column to forum_replies table
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS reply_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_forum_replies_reply_to_user_id ON forum_replies(reply_to_user_id);
