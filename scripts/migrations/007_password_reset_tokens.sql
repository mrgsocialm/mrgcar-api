-- 007_password_reset_tokens.sql
-- Table for password reset codes and tokens

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL,                    -- 6 digit verification code
    reset_token VARCHAR(64),                     -- Long token after code verification
    expires_at TIMESTAMPTZ NOT NULL,             -- Code expiration (10 minutes)
    used_at TIMESTAMPTZ,                         -- When the token was used
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_code ON password_reset_tokens(code);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(reset_token);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);

-- Clean up expired tokens periodically (optional - can be done via cron)
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
