-- E2EE v2 key directory: signed prekey bundles per user.
-- One-time prekeys reuse the existing key_packages table (opaque bytes).
CREATE TABLE IF NOT EXISTS prekey_bundles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    identity_key BYTEA NOT NULL,          -- X25519 identity public
    signing_key BYTEA NOT NULL,           -- Ed25519 identity public
    signed_prekey BYTEA NOT NULL,         -- X25519 signed prekey public
    signed_prekey_id INTEGER NOT NULL,
    signed_prekey_sig BYTEA NOT NULL,     -- Ed25519 signature over signed_prekey
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
