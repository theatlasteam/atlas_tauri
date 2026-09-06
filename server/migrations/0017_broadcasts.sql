-- Official Atlas announcements (WhatsApp-style channel): one-way chat every
-- account is in, authored by a seeded verified user. Buttons live on the
-- message; image titles live on the attachment.

ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_kind_check;
ALTER TABLE chats ADD CONSTRAINT chats_kind_check CHECK (kind IN ('dm', 'group', 'broadcast'));

ALTER TABLE messages ADD COLUMN IF NOT EXISTS buttons JSONB;

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
