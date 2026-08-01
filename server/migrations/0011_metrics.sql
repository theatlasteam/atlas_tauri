-- Aggregate-only pageview analytics for the marketing site. No raw event
-- log and no visitor identifiers: rows are hourly rollups keyed by
-- (bucket_start, path, device, referrer_host), upserted as events arrive.
-- Session-level state (used only to correlate a pageview with its
-- heartbeats for time-on-page) lives in memory in the server process and
-- is never written here — see routes::metrics::Tracker.
CREATE TABLE metrics_hourly (
    bucket_start TIMESTAMPTZ NOT NULL,
    path TEXT NOT NULL,
    device TEXT NOT NULL,
    referrer_host TEXT NOT NULL,
    pageviews BIGINT NOT NULL DEFAULT 0,
    total_duration_secs BIGINT NOT NULL DEFAULT 0,
    sessions_with_duration BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_start, path, device, referrer_host)
);

CREATE INDEX metrics_hourly_bucket_idx ON metrics_hourly(bucket_start DESC);
