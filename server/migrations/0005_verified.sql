-- Verified badge, shown as a checkmark next to a user's name. Granting/
-- revoking is restricted to the "atlas" account (checked in application
-- code, not the database — see routes/users.rs::require_atlas).
ALTER TABLE users ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false;
