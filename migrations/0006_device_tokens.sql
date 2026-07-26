-- FCM registration tokens for push notifications (Android for now).
--
-- The token is the primary key, not (user_id, token): FCM tokens are globally
-- unique per app install, and one can move between accounts — reinstall, or
-- signing out and signing in as someone else on the same device. Keying on the
-- token means registering it simply reassigns user_id, so a push for the old
-- account can never land on a device now signed in as somebody else.
CREATE TABLE device_tokens (
    token TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 'android' today; ios/web when those grow push support.
    platform TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Bumped on re-register. FCM tokens are refreshed by the client
    -- periodically, so a stale updated_at marks an install that stopped
    -- checking in and whose token is probably dead.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fanout looks tokens up by recipient.
CREATE INDEX device_tokens_user_idx ON device_tokens(user_id);
