ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_active_handle_idx ON users(handle) WHERE deleted_at IS NULL;
