ALTER TABLE bots ADD COLUMN IF NOT EXISTS delivery TEXT NOT NULL DEFAULT 'script';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS welcome TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS bot_updates (
    id           BIGSERIAL PRIMARY KEY,
    bot_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id      UUID NOT NULL,
    from_user    UUID NOT NULL,
    kind         TEXT NOT NULL,
    text         TEXT NOT NULL DEFAULT '',
    data         TEXT NOT NULL DEFAULT '',
    message_id   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_updates_bot_idx ON bot_updates (bot_user_id, id);
