-- Blocking is directed (A can block B without B being notified), unlike the
-- symmetric dm_key pairing on chats. Blocking a user does not delete or hide
-- any chat history — it only prevents new messages in either direction on
-- the existing DM (or a fresh one), enforced server-side in persist_and_fanout
-- and create_dm.
CREATE TABLE blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX blocks_blocked_idx ON blocks(blocked_id);
