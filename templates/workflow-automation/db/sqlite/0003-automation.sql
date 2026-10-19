-- Workflow automation: flows, their versions, and the runs they produce.
--
-- A flow is the thing a person edits. A flow *version* is what actually ran —
-- immutable, so a run six months old can still be explained. Editing a flow
-- creates a version; it never rewrites one, because a run pointing at a
-- rewritten definition is a run nobody can reconstruct.

CREATE TABLE IF NOT EXISTS flow (
  flow_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','archived')),
  trigger_kind  TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_kind IN ('manual','schedule','webhook','event')),
  -- Cron expression when trigger_kind = 'schedule'.
  schedule      TEXT,
  owner_user_id TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS flow_status_idx ON flow(status);

CREATE TABLE IF NOT EXISTS flow_version (
  flow_version_id TEXT PRIMARY KEY,
  flow_id       TEXT NOT NULL REFERENCES flow(flow_id),
  version        INTEGER NOT NULL,
  -- The node graph, as JSON. Opaque to the database on purpose: the shape is
  -- the application's to validate, and a schema here would have to be migrated
  -- every time a node type gains a field.
  graph          TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS flow_version_unique ON flow_version(flow_id, version);

CREATE TABLE IF NOT EXISTS flow_run (
  run_id         TEXT PRIMARY KEY,
  flow_id        TEXT NOT NULL REFERENCES flow(flow_id),
  flow_version_id TEXT NOT NULL REFERENCES flow_version(flow_version_id),
  status         TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  -- What started it, for the run list filter: 'manual' | 'schedule' | 'webhook' | 'event'
  started_by     TEXT NOT NULL,
  trigger_payload TEXT,
  error          TEXT,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT
);

CREATE INDEX IF NOT EXISTS flow_run_status_idx ON flow_run(status);
CREATE INDEX IF NOT EXISTS flow_run_flow_idx   ON flow_run(flow_id, started_at);

CREATE TABLE IF NOT EXISTS run_step (
  step_id        TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES flow_run(run_id),
  node_id        TEXT NOT NULL,
  node_type      TEXT NOT NULL,
  sequence       INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','succeeded','failed','skipped')),
  input          TEXT,
  output         TEXT,
  error          TEXT,
  started_at     TEXT,
  finished_at    TEXT
);

CREATE INDEX IF NOT EXISTS run_step_run_idx ON run_step(run_id, sequence);

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
