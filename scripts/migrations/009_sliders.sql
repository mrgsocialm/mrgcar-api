-- 009_sliders.sql
-- Homepage slider management table

CREATE TABLE IF NOT EXISTS sliders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(500),
    image_url TEXT NOT NULL,
    link_type VARCHAR(50), -- car, news, external, null
    link_id UUID,
    link_url TEXT,
    "order" INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sliders_order ON sliders("order");
CREATE INDEX IF NOT EXISTS idx_sliders_active ON sliders(is_active);
