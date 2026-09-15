-- Minds v2: from chat-room personas to autonomous 24/7 sandbox agents.
-- Keeps the 0025 tables (minds, mind_rooms) intact; rooms become optional
-- group views, while the Mind itself gains everything an agent needs.

ALTER TABLE minds
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '{"web_fetch": true, "shell": true, "message_owner": true}'::jsonb,
    ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_status TEXT NOT NULL DEFAULT 'idle';

-- Schedules: "check this listing price every day at 09:00", etc.
-- cron_expr is standard 5-field cron (min hour dom mon dow), timezone-aware via tz.
CREATE TABLE IF NOT EXISTS mind_schedules (
    id          UUID PRIMARY KEY,
    mind_id     UUID NOT NULL REFERENCES minds(id) ON DELETE CASCADE,
    label       TEXT NOT NULL DEFAULT '',
    cron_expr   TEXT NOT NULL,
    tz          TEXT NOT NULL DEFAULT 'UTC',
    task        TEXT NOT NULL DEFAULT '',
    enabled     BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mind_schedules_mind_idx ON mind_schedules (mind_id, next_run_at);

-- Runs: every agent execution (chat turn, schedule tick, manual run) leaves a
-- trace so the owner can see what the Mind did, what tools it called, and why.
CREATE TABLE IF NOT EXISTS mind_runs (
    id          UUID PRIMARY KEY,
    mind_id     UUID NOT NULL REFERENCES minds(id) ON DELETE CASCADE,
    trigger     TEXT NOT NULL DEFAULT 'chat',
    input       TEXT NOT NULL DEFAULT '',
    output      TEXT NOT NULL DEFAULT '',
    tool_calls  JSONB NOT NULL DEFAULT '[]'::jsonb,
    status      TEXT NOT NULL DEFAULT 'ok',
    error       TEXT NOT NULL DEFAULT '',
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mind_runs_mind_idx ON mind_runs (mind_id, started_at DESC);
