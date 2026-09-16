CREATE TABLE IF NOT EXISTS desktop_displays (
    mind_id UUID PRIMARY KEY REFERENCES minds(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_num INT NOT NULL CHECK (display_num BETWEEN 1 AND 32),
    vnc_port INT NOT NULL,
    novnc_port INT NOT NULL,
    -- Who currently drives the screen: 'mind' or 'owner' (takeover).
    control TEXT NOT NULL DEFAULT 'mind',
    -- Pending takeover request text from the Mind, NULL when none.
    takeover_request TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, display_num),
    UNIQUE (vnc_port),
    UNIQUE (novnc_port)
);
