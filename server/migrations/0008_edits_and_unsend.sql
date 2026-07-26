-- Editing and unsending.
--
-- Both are recorded on the message row rather than by rewriting history:
--
--  * `edited_at` marks that the body changed after it was sent, so the client
--    can label it. Previous versions are deliberately NOT retained — the point
--    of an edit is that the old text is gone, and keeping a shadow copy the
--    author cannot see or delete would be worse than not offering edits.
--
--  * `deleted_at` makes an unsent message a tombstone rather than a missing
--    row. Replies point at message ids and read cursors are message ids, so a
--    real DELETE would strand quoted previews and let unread counts drift. The
--    body is wiped in the same statement that sets this, so an unsent message
--    stops existing as content while continuing to exist as a position.

ALTER TABLE messages
    ADD COLUMN edited_at  TIMESTAMPTZ,
    ADD COLUMN deleted_at TIMESTAMPTZ;
