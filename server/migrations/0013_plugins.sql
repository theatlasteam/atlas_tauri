-- Plugin store: the catalog behind the marketing-site editor and the in-app
-- plugin runtime. Plugins are user-authored JS workspaces written through the
-- web editor and installed from the app's Plugins screen.
--
-- A plugin is a set of files (manifest.json + main.js + helpers) stored as a
-- JSON object of filename -> source. The scalar columns are denormalized from
-- manifest.json so the store can be listed without parsing every body.
CREATE TABLE IF NOT EXISTS plugins (
    id UUID PRIMARY KEY,
    -- The plugin's manifest id ("dev.signature"), the key installs are keyed by.
    plugin_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    files JSONB NOT NULL DEFAULT '{}',
    downloads BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plugins_created_at_idx ON plugins(created_at DESC);