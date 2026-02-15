-- Add scheduling fields to news table
ALTER TABLE news ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published';
ALTER TABLE news ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

-- Set published_at to created_at for existing rows
UPDATE news SET published_at = created_at WHERE published_at IS NULL;

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_news_status ON news(status);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at);
