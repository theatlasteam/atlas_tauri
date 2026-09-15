ALTER TABLE users
    ADD COLUMN IF NOT EXISTS atlas_x BOOLEAN NOT NULL DEFAULT false;

UPDATE users SET atlas_x = true WHERE handle = 'atlas' OR verified = true;

CREATE TABLE minds (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    color_end   TEXT NOT NULL,
    prompt      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX minds_owner_idx ON minds (owner_id, created_at DESC);

CREATE TABLE mind_rooms (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mind_rooms_owner_idx ON mind_rooms (owner_id, created_at DESC);

CREATE TABLE mind_room_members (
    room_id UUID NOT NULL REFERENCES mind_rooms(id) ON DELETE CASCADE,
    mind_id UUID NOT NULL REFERENCES minds(id) ON DELETE CASCADE,
    PRIMARY KEY (room_id, mind_id)
);

CREATE TABLE mind_messages (
    id         UUID PRIMARY KEY,
    room_id    UUID NOT NULL REFERENCES mind_rooms(id) ON DELETE CASCADE,
    mind_id    UUID REFERENCES minds(id) ON DELETE SET NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mind_messages_room_idx ON mind_messages (room_id, created_at);
