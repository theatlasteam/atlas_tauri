CREATE TABLE canvases (
    id          UUID PRIMARY KEY,
    creator_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    strokes     JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX canvases_creator_idx ON canvases (creator_id);
