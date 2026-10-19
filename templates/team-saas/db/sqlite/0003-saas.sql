-- Multi-tenant team workspaces: organisations, membership, projects, issues.
--
-- The load-bearing table is `membership`. A person's role is a property of the
-- *pair* (user, organisation), not of the user — the same account is an owner
-- of their own workspace and a plain member of a client's. Putting a role
-- column on the user is the mistake this schema exists to avoid, because it
-- cannot express that and quietly grants the wrong thing everywhere.

CREATE TABLE IF NOT EXISTS organisation (
  org_id       TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  plan_status  TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan_status IN ('trial','active','past_due','cancelled')),
  seats        INTEGER NOT NULL DEFAULT 5,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS membership (
  membership_id TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organisation(org_id),
  user_id      TEXT NOT NULL,
  -- The role *within this organisation*: 'owner' | 'admin' | 'member' | 'viewer'.
  -- Deliberately not the same thing as a declared system role, which says what
  -- somebody may do on the platform as a whole.
  org_role     TEXT NOT NULL DEFAULT 'member'
    CHECK (org_role IN ('owner','admin','member','viewer')),
  invited_by   TEXT,
  joined_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS membership_unique ON membership(org_id, user_id);
CREATE INDEX IF NOT EXISTS membership_user_idx ON membership(user_id);

CREATE TABLE IF NOT EXISTS invitation (
  invitation_id TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organisation(org_id),
  email        TEXT NOT NULL,
  org_role     TEXT NOT NULL DEFAULT 'member',
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','revoked','expired')),
  token        TEXT NOT NULL UNIQUE,
  invited_by   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS invitation_org_idx ON invitation(org_id, status);

-- Every tenant-owned table carries org_id. Not derivable by joining up through
-- a parent: a query that forgets the tenant filter is the failure mode here,
-- and a column you can filter on directly is one a reviewer can see is missing.
CREATE TABLE IF NOT EXISTS project (
  project_id   TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organisation(org_id),
  name         TEXT NOT NULL,
  key          TEXT NOT NULL,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS project_key_unique ON project(org_id, key);
CREATE INDEX IF NOT EXISTS project_org_idx ON project(org_id);

CREATE TABLE IF NOT EXISTS issue (
  issue_id     TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organisation(org_id),
  project_id   TEXT NOT NULL REFERENCES project(project_id),
  number       INTEGER NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','done','closed')),
  priority     TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id  TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS issue_number_unique ON issue(project_id, number);
CREATE INDEX IF NOT EXISTS issue_org_idx    ON issue(org_id, status);
CREATE INDEX IF NOT EXISTS issue_assignee_idx ON issue(assignee_id);

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
