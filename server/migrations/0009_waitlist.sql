-- Alpha-test waitlist signups collected from the marketing site. Not tied to
-- a user account — most signups happen before anyone can register.
CREATE TABLE waitlist (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX waitlist_created_at_idx ON waitlist(created_at DESC);
