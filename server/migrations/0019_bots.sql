ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS bots (
    id           UUID PRIMARY KEY,
    owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token_hash   BYTEA NOT NULL UNIQUE,
    webhook_url  TEXT NOT NULL DEFAULT '',
    script       TEXT NOT NULL DEFAULT '{"replies":[]}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bots_owner_idx ON bots(owner_id);
