-- Atlas messenger schema.
--
-- Design notes:
--  * Message ids are UUIDv7 (time-ordered). Postgres compares UUIDs bytewise and
--    UUIDv7 is big-endian time-prefixed, so `id > $cursor` is a correct, index-only
--    keyset pagination / unread-count predicate. No per-chat sequence table needed.
--  * Message bodies are opaque bytes + a `scheme` tag. The server never depends on
--    plaintext: an E2EE client stores ciphertext under scheme 'mls-v1' and the
--    server treats it identically to 'plain'. This is what keeps E2EE deployable
--    without a schema change.
--  * Presence is NOT stored here (it lives in the connection hub); only the
--    coarse `last_seen_at` is persisted, updated on disconnect.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id             UUID PRIMARY KEY,
    handle         CITEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    bio            TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT '',
    avatar_color   TEXT NOT NULL DEFAULT '#f59e0b',
    avatar_initial TEXT NOT NULL DEFAULT '?',
    password_hash  TEXT NOT NULL,
    -- Long-term public identity key for E2EE (client-generated; server never
    -- sees private keys). NULL until the client publishes one.
    identity_key   BYTEA,
    last_seen_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per logged-in device. Tokens are stored only as SHA-256 hashes so a
-- database leak does not yield usable credentials.
CREATE TABLE sessions (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   BYTEA NOT NULL UNIQUE,
    device_name  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE chats (
    id           UUID PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('dm', 'group')),
    -- NULL for DMs; the client-facing name of a DM is the *other* member.
    name         TEXT,
    avatar_color TEXT,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Canonical "smaller_uuid:larger_uuid" for DMs so two users can only ever
    -- have one DM between them (enforced by the unique index, race-free).
    dm_key       TEXT UNIQUE
);

CREATE TABLE chat_members (
    chat_id              UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    muted                BOOLEAN NOT NULL DEFAULT FALSE,
    -- Read cursor. Unread count = messages with id > this (UUIDv7 ordering).
    last_read_message_id UUID,
    PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX chat_members_user_idx ON chat_members(user_id);

CREATE TABLE messages (
    id         UUID PRIMARY KEY,                     -- UUIDv7, time-ordered
    chat_id    UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users(id),
    scheme     TEXT NOT NULL DEFAULT 'plain',        -- 'plain' | 'mls-v1' | ...
    body       BYTEA NOT NULL,
    -- Client-generated idempotency tag: resending after a dropped connection
    -- cannot duplicate a message (unique index below).
    client_tag TEXT,
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The one index that matters for a messenger: history pages and unread counts
-- are both `WHERE chat_id = ? AND id (<|>) ?` scans on this.
CREATE INDEX messages_chat_idx ON messages(chat_id, id DESC);
CREATE UNIQUE INDEX messages_dedupe_idx ON messages(author_id, client_tag)
    WHERE client_tag IS NOT NULL;

-- Per-user chat folders (client feature parity).
CREATE TABLE folders (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    position   INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX folders_user_idx ON folders(user_id);

CREATE TABLE folder_chats (
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    chat_id   UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    PRIMARY KEY (folder_id, chat_id)
);

-- E2EE key distribution: clients publish one-time key packages (MLS KeyPackage
-- or X3DH prekey bundle — opaque to the server); peers claim them to establish
-- sessions/groups. Claimed packages are never handed out twice.
CREATE TABLE key_packages (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id  TEXT NOT NULL,
    package    BYTEA NOT NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX key_packages_avail_idx ON key_packages(user_id, created_at)
    WHERE claimed_at IS NULL;
