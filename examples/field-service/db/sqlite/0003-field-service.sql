-- Field service: one database, many service companies.
--
-- Every domain table carries `company_id` rather than relying on a schema or a
-- database per tenant, because the thing a dispatcher actually asks for is "my
-- jobs", and that question has to be answerable in one index. The tenant column
-- is first in every index for the same reason.

CREATE TABLE IF NOT EXISTS company (
  company_id   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Which company a signed-in person works for.
--
-- Keyed on the email address, not on `user.id`, because a membership is an
-- invitation and an invitation exists before the account does. It is also what
-- makes the seed possible at all: scenario actors are provisioned by Better
-- Auth at first sign-in, so there is no user id to write down at migration
-- time. Better Auth owns the `user` table, so this sits beside it rather than
-- as a column on it — a person may leave, and revoking their membership must
-- not delete their account.
CREATE TABLE IF NOT EXISTS membership (
  membership_id TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES company(company_id),
  email         TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS membership_unique ON membership(company_id, email);
CREATE INDEX IF NOT EXISTS membership_email_idx ON membership(email);

CREATE TABLE IF NOT EXISTS customer (
  customer_id  TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES company(company_id),
  name         TEXT NOT NULL,
  address      TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS customer_company_idx ON customer(company_id, name);

CREATE TABLE IF NOT EXISTS technician (
  technician_id TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES company(company_id),
  -- The account that signs in as this technician, if they have one. Nullable:
  -- a subcontractor gets dispatched without ever being given a login.
  email         TEXT,
  name          TEXT NOT NULL,
  -- What they are allowed on site. A boiler job dispatched to someone with no
  -- gas ticket is the mistake this column exists to make visible.
  skills        TEXT NOT NULL DEFAULT '[]',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS technician_company_idx ON technician(company_id, is_active);

CREATE TABLE IF NOT EXISTS job (
  job_id       TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES company(company_id),
  customer_id  TEXT NOT NULL REFERENCES customer(customer_id),
  technician_id TEXT REFERENCES technician(technician_id),
  title        TEXT NOT NULL,
  description  TEXT,
  -- The CHECK is the source of truth for the status set: widen it here and the
  -- generated union widens with it.
  status       TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','scheduled','in_progress','awaiting_parts','done','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','urgent')),
  scheduled_for TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS job_company_status_idx ON job(company_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS job_technician_idx ON job(technician_id, scheduled_for);

-- A job is the work; a visit is one attendance at the site. Two tables because
-- a job routinely takes three visits, and collapsing them loses the history the
-- customer is actually billed against.
CREATE TABLE IF NOT EXISTS visit (
  visit_id     TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES company(company_id),
  job_id       TEXT NOT NULL REFERENCES job(job_id),
  technician_id TEXT NOT NULL REFERENCES technician(technician_id),
  started_at   TEXT,
  ended_at     TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS visit_job_idx ON visit(job_id, created_at);

CREATE TABLE IF NOT EXISTS quote (
  quote_id     TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES company(company_id),
  job_id       TEXT NOT NULL REFERENCES job(job_id),
  amount_cents INTEGER NOT NULL,
  summary      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','awaiting_approval','approved','rejected')),
  approved_by  TEXT,
  decided_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS quote_job_idx ON quote(job_id, created_at);
CREATE INDEX IF NOT EXISTS quote_company_status_idx ON quote(company_id, status);

-- A voice note dictated from the van. The audio is not stored: the transcript
-- is what anyone ever reads, and keeping the recording turns a note into a
-- retention problem.
CREATE TABLE IF NOT EXISTS voice_note (
  voice_note_id TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES company(company_id),
  job_id        TEXT NOT NULL REFERENCES job(job_id),
  technician_id TEXT NOT NULL REFERENCES technician(technician_id),
  transcript    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS voice_note_job_idx ON voice_note(job_id, created_at);
