-- Anti-sybil: who created which account, from where, on what device.
-- IPs and fingerprints are stored only as SHA-256 hashes (privacy policy §2),
-- so a DB leak reveals no addresses and no raw device traits.

CREATE TABLE IF NOT EXISTS account_fingerprints (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ip_hash TEXT NOT NULL,
    device_fp_hash TEXT NOT NULL DEFAULT '',
    user_agent_hash TEXT NOT NULL DEFAULT '',
    risk_score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fingerprints_ip_time
    ON account_fingerprints (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_fingerprints_device_time
    ON account_fingerprints (device_fp_hash, created_at)
    WHERE device_fp_hash <> '';

-- Failed logins feed the per-handle/per-IP brute-force limiter and persist
-- across restarts (the in-memory sliding window alone would reset on deploy).
CREATE TABLE IF NOT EXISTS auth_failures (
    id BIGSERIAL PRIMARY KEY,
    handle TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_failures_ip_time
    ON auth_failures (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_failures_handle_time
    ON auth_failures (handle, created_at);
