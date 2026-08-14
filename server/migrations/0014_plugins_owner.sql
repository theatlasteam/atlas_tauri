-- Tie every plugin to the Atlas account that published it. The web editor
-- now requires sign-in to create/edit/delete, and edits are restricted to
-- the owner. `ON DELETE SET NULL` keeps legacy (and deleted-account) rows
-- browsable in the store while still showing no developer badge.
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS plugins_owner_id_idx ON plugins(owner_id);
