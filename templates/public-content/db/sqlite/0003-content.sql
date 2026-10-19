-- A publication: posts, authors, tags.
--
-- The boundary that matters here is `status`, and it is exactly as
-- consequential as tenancy is in a multi-tenant product. A draft is somebody's
-- unfinished thinking, and an embargoed post is a scheduled announcement.
-- Leaking either is the failure mode this schema is shaped around, which is why
-- published_at is a real column and not a boolean: "published" is a moment, and
-- a post can be dated forward.

CREATE TABLE IF NOT EXISTS author (
  author_id    TEXT PRIMARY KEY,
  user_id      TEXT,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  bio          TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post (
  post_id      TEXT PRIMARY KEY,
  author_id    TEXT NOT NULL REFERENCES author(author_id),
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  excerpt      TEXT,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','published','archived')),
  -- Null until published. A future value means scheduled, and the public read
  -- compares against now rather than trusting status alone.
  published_at TEXT,
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS post_published_idx ON post(status, published_at);

CREATE TABLE IF NOT EXISTS tag (
  tag_id       TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tag (
  post_id      TEXT NOT NULL REFERENCES post(post_id),
  tag_id       TEXT NOT NULL REFERENCES tag(tag_id),
  PRIMARY KEY (post_id, tag_id)
);

-- Counted rather than joined from a log: the public read is the hot path and
-- must not fan out.
CREATE TABLE IF NOT EXISTS post_view (
  post_id      TEXT PRIMARY KEY REFERENCES post(post_id),
  views        INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Structured audit events: the things that are not table writes — a login, an
-- export, a refusal — and therefore leave no row of their own behind.
CREATE TABLE IF NOT EXISTS audit_event (
  audit_id     TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  actor_id     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS audit_event_entity_idx ON audit_event(entity_type, entity_id);
