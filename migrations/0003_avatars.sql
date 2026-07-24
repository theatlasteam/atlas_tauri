-- Profile pictures reuse the existing attachments table (owner-uploaded
-- image blobs) rather than a separate storage path. A user's avatar is just
-- a pointer to one of their own image attachments.
ALTER TABLE users ADD COLUMN avatar_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;
