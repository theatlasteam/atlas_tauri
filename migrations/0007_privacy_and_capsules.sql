-- Two additions that were previously faked (or missing) client-side.
--
-- 1. Privacy switches with teeth. "Read receipts" and "Last seen" existed only
--    as localStorage booleans in the client, so flipping them changed nothing
--    that anyone else could observe. They live on the user row now and the
--    server enforces them: see models.rs (last_seen_at is stripped in
--    From<UserRow>) and routes/messages.rs::fanout_read_receipt.
--
--    Both default to true, which matches the behaviour every existing account
--    already has — this migration changes nobody's visibility silently.
--
-- 2. Time capsules. A message may carry an unlock time; until then the server
--    refuses to hand its body to anyone but the author. The row exists from
--    the moment it is sent (recipients see a sealed bubble counting down), so
--    ordinary UUIDv7 history ordering keeps working — a capsule does not
--    teleport to the end of the thread when it opens.

ALTER TABLE users
    ADD COLUMN read_receipts     BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN last_seen_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE messages ADD COLUMN unlock_at TIMESTAMPTZ;

-- Sealed messages are a small minority of the table, so the index that matters
-- is a partial one: "which capsules are still shut" is the only question asked.
CREATE INDEX messages_sealed_idx ON messages(unlock_at) WHERE unlock_at IS NOT NULL;
