-- Per-user custom emoji packs. Files live on disk as attachments/emoji/{id}.

CREATE TABLE custom_emojis (
    id           UUID PRIMARY KEY,
    owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT '',
    mime         TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    width        INT,
    height       INT,
    copied_from  UUID REFERENCES custom_emojis(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX custom_emojis_owner_idx ON custom_emojis (owner_id, created_at DESC);
CREATE UNIQUE INDEX custom_emojis_copy_idx ON custom_emojis (owner_id, copied_from)
    WHERE copied_from IS NOT NULL;

CREATE TABLE custom_emoji_packs (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, owner_id),
    CHECK (user_id <> owner_id)
);
