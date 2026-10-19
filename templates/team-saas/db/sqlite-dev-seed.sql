-- Dev seed (applied via `pikku db reset` after `pikku db migrate`).
--
-- Two organisations, because one cannot demonstrate the only claim this
-- template makes: that a member sees their own workspace and nothing from the
-- one next to it. A single-org seed makes every tenancy bug invisible.
--
-- Memberships are selected out of better-auth's `user` table by address rather
-- than written as literal ids, because the accounts are created by
-- `pikku persona sync` — which runs *after* `db reset` applies this file. So on
-- a fresh database the INSERT ... SELECT matches nothing and no membership is
-- created; re-applying the seed after the sync fills them in. Every statement
-- here is idempotent so that second pass is safe.
--
--   pikku db migrate && pikku db reset
--   pikku persona sync local
--   sqlite3 .pikku-runtime/dev.db < db/sqlite-dev-seed.sql   # memberships

INSERT INTO organisation (org_id, name, slug, plan_status, seats) VALUES
  ('org_acme',      'Acme Instruments', 'acme-instruments', 'active', 12),
  ('org_northwind', 'Northwind Supply', 'northwind-supply', 'trial',  5)
ON CONFLICT DO NOTHING;

INSERT INTO project (project_id, org_id, name, key, archived) VALUES
  ('prj_platform', 'org_acme',      'Platform',   'PLAT', 0),
  ('prj_billing',  'org_acme',      'Billing',    'BILL', 0),
  ('prj_legacy',   'org_acme',      'Legacy API', 'LEG',  1),
  ('prj_site',     'org_northwind', 'Storefront', 'SHOP', 0)
ON CONFLICT DO NOTHING;

-- A backlog with a spread of priority and status. Every row being 'normal' and
-- 'open' would make the priority column pure decoration and hide whether an
-- urgent issue is actually findable.
-- `created_at` is staggered deliberately. The board orders newest-first, and
-- rows sharing a single datetime('now') come back in whatever order SQLite
-- feels like — which looks like a broken sort rather than an unset field.
INSERT INTO issue (issue_id, org_id, project_id, number, title, body, status, priority, created_by, created_at) VALUES
  ('iss_1',  'org_acme', 'prj_platform', 41, 'Sessions drop when the worker restarts',        'Reproducible on deploy. Suspect the session store is process-local.', 'in_progress', 'urgent', 'seed', datetime('now','-2 hours')),
  ('iss_2',  'org_acme', 'prj_platform', 42, 'Audit log misses permission refusals',          'A denied request leaves no row, so we cannot tell refusal from absence.', 'open', 'high', 'seed', datetime('now','-6 hours')),
  ('iss_3',  'org_acme', 'prj_billing',  17, 'Proration is wrong when a plan changes mid-day','Off by one day in the customer''s favour, which is why nobody reported it.', 'open', 'high', 'seed', datetime('now','-1 day')),
  ('iss_4',  'org_acme', 'prj_billing',  18, 'Invoice PDF wraps long company names',          NULL, 'open', 'low', 'seed', datetime('now','-2 days')),
  ('iss_5',  'org_acme', 'prj_platform', 43, 'Rate limiter counts retries twice',             NULL, 'open', 'normal', 'seed', datetime('now','-3 days')),
  ('iss_6',  'org_acme', 'prj_platform', 44, 'Add an index on issue(org_id, status)',         'The board query is a full scan once an org passes a few thousand rows.', 'done', 'normal', 'seed', datetime('now','-9 days')),
  ('iss_7',  'org_acme', 'prj_billing',  19, 'Dunning email sent twice on payment retry',     NULL, 'in_progress', 'urgent', 'seed', datetime('now','-4 hours')),
  ('iss_8',  'org_acme', 'prj_platform', 45, 'Sign-out does not revoke other sessions',       NULL, 'open', 'high', 'seed', datetime('now','-12 hours')),
  -- Reserved for the coverage scenario's MCP call. Without a row of its own the
  -- MCP tool and the browser journey close the same issue, and whichever runs
  -- second asserts against a board that has already changed.
  ('iss_probe', 'org_acme', 'prj_platform', 99, 'Reserved for coverage', NULL, 'open', 'low', 'seed', datetime('now','-1 hour')),
  ('iss_9',  'org_acme', 'prj_legacy',   3,  'Decide the removal date for v1',                NULL, 'closed', 'low', 'seed', datetime('now','-40 days')),
  ('iss_10', 'org_acme', 'prj_platform', 46, 'Timestamps render in the server''s timezone',   NULL, 'open', 'normal', 'seed', datetime('now','-4 days')),
  -- Northwind's own rows. If these ever appear on an Acme member's board, the
  -- tenancy check is broken — which is exactly what this template exists to show.
  ('iss_11', 'org_northwind', 'prj_site', 7, 'Basket empties on sign-in',                     'The anonymous basket is not merged into the account.', 'open', 'urgent', 'seed', datetime('now','-5 hours')),
  ('iss_12', 'org_northwind', 'prj_site', 8, 'Out-of-stock items still purchasable',          NULL, 'open', 'high', 'seed', datetime('now','-2 days'))
ON CONFLICT DO NOTHING;

-- Dana owns one organisation and is a plain member of another — the case a
-- global role cannot express, and the reason `membership` exists at all.
INSERT INTO membership (membership_id, org_id, user_id, org_role)
SELECT 'mem_dana_acme', 'org_acme', id, 'owner' FROM user WHERE email = 'dana@actors.local'
ON CONFLICT DO NOTHING;

INSERT INTO membership (membership_id, org_id, user_id, org_role)
SELECT 'mem_dana_nw', 'org_northwind', id, 'member' FROM user WHERE email = 'dana@actors.local'
ON CONFLICT DO NOTHING;

INSERT INTO membership (membership_id, org_id, user_id, org_role)
SELECT 'mem_viv_acme', 'org_acme', id, 'member' FROM user WHERE email = 'viv@actors.local'
ON CONFLICT DO NOTHING;

-- The starter's health-check persona gets a workspace too, so the app's screens
-- have something to render when a run signs in as it.
INSERT INTO membership (membership_id, org_id, user_id, org_role)
SELECT 'mem_visitor_acme', 'org_acme', id, 'member' FROM user WHERE email = 'visitor@actors.local'
ON CONFLICT DO NOTHING;

-- Sasha (support) deliberately gets NO membership: she reaches a customer's
-- workspace through admin:impersonate, and a membership would make that
-- distinction untestable.

INSERT INTO invitation (invitation_id, org_id, email, org_role, status, token, invited_by, expires_at) VALUES
  ('inv_1', 'org_acme', 'rowan@example.com', 'member', 'pending', 'tok_seed_rowan', 'seed', datetime('now','+6 days'))
ON CONFLICT DO NOTHING;
