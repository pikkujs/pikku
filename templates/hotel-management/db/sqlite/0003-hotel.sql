-- Hotel management: rooms, guests, bookings, stays and housekeeping.
--
-- A booking is an intention; a stay is what actually happened. They are separate
-- tables because a booking can be cancelled or no-show and never become a stay,
-- and a stay can outlive its booking (a walk-in has no booking at all).

CREATE TABLE IF NOT EXISTS room_type (
  room_type_id  TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  capacity      INTEGER NOT NULL,
  base_rate_cents INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room (
  room_id       TEXT PRIMARY KEY,
  room_type_id  TEXT NOT NULL REFERENCES room_type(room_type_id),
  number        TEXT NOT NULL UNIQUE,
  floor         INTEGER NOT NULL,
  -- A CHECK constraint rather than a comment: pikku reads these into
  -- enums.gen.ts, which is what lets the i18n layer prove every state has a
  -- label. A comment tells a reader; a constraint tells the toolchain.
  housekeeping_status TEXT NOT NULL DEFAULT 'clean'
    CHECK (housekeeping_status IN ('clean','dirty','inspected','out_of_service')),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guest (
  guest_id      TEXT PRIMARY KEY,
  -- Null for walk-ins who never made an account.
  user_id       TEXT,
  full_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking (
  booking_id    TEXT PRIMARY KEY,
  guest_id      TEXT NOT NULL REFERENCES guest(guest_id),
  room_type_id  TEXT NOT NULL REFERENCES room_type(room_type_id),
  -- Assigned late: a booking is for a *kind* of room, and which one is decided
  -- at check-in so housekeeping and maintenance can move people around.
  room_id       TEXT REFERENCES room(room_id),
  arrival       TEXT NOT NULL,
  departure     TEXT NOT NULL,
  guests        INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','confirmed','checked_in','checked_out','cancelled','no_show')),
  total_cents   INTEGER NOT NULL,
  source        TEXT NOT NULL DEFAULT 'direct',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS booking_arrival_idx ON booking(arrival);
CREATE INDEX IF NOT EXISTS booking_status_idx  ON booking(status);

CREATE TABLE IF NOT EXISTS housekeeping_task (
  task_id       TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL REFERENCES room(room_id),
  kind          TEXT NOT NULL
    CHECK (kind IN ('turnover','stayover','deep_clean','maintenance')),
  status        TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','done')),
  assigned_to   TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS housekeeping_status_idx ON housekeeping_task(status);

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
