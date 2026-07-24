-- Rich messages: replies, reactions, attachments, and call-log messages.

ALTER TABLE messages ADD COLUMN reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;

CREATE TABLE attachments (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('image', 'voice', 'file')),
    mime        TEXT NOT NULL,
    size_bytes  BIGINT NOT NULL,
    filename    TEXT NOT NULL DEFAULT '',
    duration_ms INT,          -- voice messages
    width       INT,          -- images
    height      INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ADD COLUMN attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;
CREATE INDEX messages_attachment_idx ON messages(attachment_id) WHERE attachment_id IS NOT NULL;

CREATE TABLE message_reactions (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX message_reactions_msg_idx ON message_reactions(message_id);
