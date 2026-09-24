ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_kind_check;
ALTER TABLE chats ADD CONSTRAINT chats_kind_check CHECK (kind IN ('dm', 'group', 'broadcast', 'system'));
ALTER TABLE chats ADD COLUMN IF NOT EXISTS system_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS chats_system_member_idx
  ON chats (created_by, system_key) WHERE system_key IS NOT NULL;

ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
