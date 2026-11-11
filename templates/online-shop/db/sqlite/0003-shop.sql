-- Online shop: catalogue, baskets and orders.
--
-- A basket becomes an order when it is paid for. They are separate tables
-- because a basket is mutable and disposable and an order is neither — once
-- money has changed hands the row stops changing, and a correction becomes a
-- new fact rather than an edit.

CREATE TABLE IF NOT EXISTS category (
  category_id  TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item (
  item_id      TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES category(category_id),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT,
  price_cents  INTEGER NOT NULL,
  -- Decremented when the order is placed, not when it ships: two shoppers
  -- buying the last item and one finding out days later is a worse failure
  -- than briefly over-reserving.
  stock        INTEGER NOT NULL DEFAULT 0,
  image_url    TEXT,
  -- Withdrawn items stay in the table: an order line references them, and
  -- deleting the row would make old orders unreadable.
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS item_category_idx ON item(category_id);

CREATE TABLE IF NOT EXISTS basket (
  basket_id    TEXT PRIMARY KEY,
  -- One of these is set. A basket exists before anyone signs in, so an
  -- anonymous shopper gets a session-keyed basket that is claimed at sign-in.
  user_id      TEXT,
  session_id   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS basket_user_idx ON basket(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS basket_item (
  basket_item_id TEXT PRIMARY KEY,
  basket_id    TEXT NOT NULL REFERENCES basket(basket_id),
  item_id      TEXT NOT NULL REFERENCES item(item_id),
  quantity     INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS basket_item_unique ON basket_item(basket_id, item_id);

CREATE TABLE IF NOT EXISTS "order" (
  order_id     TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  -- The CHECK is the source of truth for the status set: widen it here and the
  -- generated union widens with it, so writing a status nobody declared is a
  -- type error rather than a runtime constraint violation.
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','payment_failed','shipped','cancelled','refunded')),
  total_cents  INTEGER NOT NULL,
  shipping_address TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS order_user_idx   ON "order"(user_id, created_at);
CREATE INDEX IF NOT EXISTS order_status_idx ON "order"(status);

CREATE TABLE IF NOT EXISTS order_item (
  order_item_id TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES "order"(order_id),
  item_id      TEXT NOT NULL REFERENCES item(item_id),
  quantity     INTEGER NOT NULL,
  -- Price at the time of ordering. Reading it back off `item` would rewrite
  -- history every time somebody changes a price.
  unit_price_cents INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS order_item_order_idx ON order_item(order_id);

-- @snippet start paymentTable
CREATE TABLE IF NOT EXISTS payment (
  payment_id   TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES "order"(order_id),
  amount_cents INTEGER NOT NULL,
  -- 'succeeded' | 'failed'
  status       TEXT NOT NULL,
  provider     TEXT,
  provider_ref TEXT,
  reason       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
-- @snippet end paymentTable

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id     TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  actor_id     TEXT,
  payload      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity_type, entity_id);
