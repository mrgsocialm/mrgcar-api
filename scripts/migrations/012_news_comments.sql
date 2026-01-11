-- News comments table
CREATE TABLE IF NOT EXISTS news_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    news_id UUID NOT NULL,
    user_id UUID,
    user_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries by news_id
CREATE INDEX IF NOT EXISTS idx_news_comments_news_id ON news_comments(news_id);
CREATE INDEX IF NOT EXISTS idx_news_comments_created ON news_comments(created_at DESC);
