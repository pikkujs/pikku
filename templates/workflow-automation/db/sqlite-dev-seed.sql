-- Dev seed (applied via `pikku db reset` after `pikku db migrate`).
--
-- Enough of an automation platform to see whether the screens work. The point
-- of seeding runs rather than only flows is that the runs list is where an
-- operator actually lives, and a runs list with nothing in it cannot show
-- whether a failure stands out from the successes around it — which is the one
-- job that page has.
--
-- `owner_user_id` / `started_by` are deliberately literals, not persona ids:
-- the seed runs before `pikku persona sync` creates any account, and neither
-- column has a foreign key.

INSERT INTO flow (flow_id, name, slug, description, status, trigger_kind, schedule, owner_user_id) VALUES
  ('flw_invoices', 'Chase unpaid invoices', 'chase-unpaid-invoices', 'Emails a reminder for every invoice more than 14 days overdue', 'active', 'schedule', '0 9 * * 1', 'seed'),
  ('flw_signup',   'Welcome new signups',   'welcome-new-signups',   'Adds the account to the CRM and sends the first-week sequence',  'active', 'event',    NULL,        'seed'),
  ('flw_backup',   'Nightly export',        'nightly-export',        'Writes yesterday''s orders to the warehouse bucket',             'active', 'schedule', '0 2 * * *', 'seed'),
  ('flw_support',  'Route support email',   'route-support-email',   'Classifies an inbound message and assigns it to a queue',        'paused', 'webhook',  NULL,        'seed'),
  ('flw_draft',    'Churn risk digest',     'churn-risk-digest',     'Not finished — still deciding what counts as at-risk',           'draft',  'manual',   NULL,        'seed'),
  -- The only ACTIVE webhook flow, and the reason `sweepPendingWebhooks` has
  -- anything to do. `flw_support` is paused, so before this row the sweep
  -- selected zero flows and never reached `onWebhookReceived` — the scenario
  -- step passed while proving nothing about the handler it exists to drive.
  ('flw_inbox',    'Inbound form intake',   'inbound-form-intake',   'Turns a posted form into a task, whenever the endpoint is hit',   'active', 'webhook',  NULL,        'seed')
ON CONFLICT DO NOTHING;

INSERT INTO flow_version (flow_version_id, flow_id, version, graph, created_by) VALUES
  ('fv_invoices_3', 'flw_invoices', 3, '{"nodes":[{"id":"n1","type":"query"},{"id":"n2","type":"filter"},{"id":"n3","type":"email"}]}', 'seed'),
  ('fv_signup_1',   'flw_signup',   1, '{"nodes":[{"id":"n1","type":"webhook"},{"id":"n2","type":"http"}]}',                            'seed'),
  ('fv_backup_2',   'flw_backup',   2, '{"nodes":[{"id":"n1","type":"query"},{"id":"n2","type":"s3"}]}',                                 'seed'),
  ('fv_support_1',  'flw_support',  1, '{"nodes":[{"id":"n1","type":"webhook"},{"id":"n2","type":"classify"}]}',                         'seed')
ON CONFLICT DO NOTHING;

-- One failure among several successes, plus one still running and one queued.
-- That mix is the seed's whole purpose: it is the only way to see whether the
-- runs table makes a failure findable at a glance.
INSERT INTO flow_run (run_id, flow_id, flow_version_id, status, started_by, error, started_at, finished_at) VALUES
  ('run_1', 'flw_backup',   'fv_backup_2',   'failed',    'schedule', 'S3 PutObject denied: the warehouse bucket policy no longer allows this role', datetime('now','-42 minutes'), datetime('now','-41 minutes')),
  ('run_2', 'flw_invoices', 'fv_invoices_3', 'succeeded', 'schedule', NULL, datetime('now','-2 hours'),   datetime('now','-2 hours','+38 seconds')),
  ('run_3', 'flw_signup',   'fv_signup_1',   'succeeded', 'event',    NULL, datetime('now','-3 hours'),   datetime('now','-3 hours','+2 seconds')),
  ('run_4', 'flw_signup',   'fv_signup_1',   'succeeded', 'event',    NULL, datetime('now','-5 hours'),   datetime('now','-5 hours','+2 seconds')),
  ('run_5', 'flw_invoices', 'fv_invoices_3', 'running',   'manual',   NULL, datetime('now','-3 minutes'), NULL),
  ('run_6', 'flw_support',  'fv_support_1',  'cancelled', 'webhook',  NULL, datetime('now','-1 day'),     datetime('now','-1 day','+12 seconds')),
  ('run_7', 'flw_backup',   'fv_backup_2',   'succeeded', 'schedule', NULL, datetime('now','-1 day'),     datetime('now','-1 day','+94 seconds')),
  -- Reserved for the coverage scenario's MCP call: cancelling needs a run that
  -- is actually cancellable, and every other queued run is on screen.
  ('run_probe', 'flw_signup', 'fv_signup_1', 'queued', 'event', NULL, datetime('now','-1 minute'), NULL),
  ('run_8', 'flw_signup',   'fv_signup_1',   'queued',    'event',    NULL, datetime('now','-1 minute'),  NULL)
ON CONFLICT DO NOTHING;

INSERT INTO run_step (step_id, run_id, node_id, node_type, sequence, status, input, output, error, started_at, finished_at) VALUES
  ('st_1_1', 'run_1', 'n1', 'query', 1, 'succeeded', '{"since":"yesterday"}', '{"rows":1284}', NULL, datetime('now','-42 minutes'), datetime('now','-42 minutes','+9 seconds')),
  ('st_1_2', 'run_1', 'n2', 's3',    2, 'failed',    '{"key":"orders/2026-08-07.csv"}', NULL, 'AccessDenied', datetime('now','-42 minutes','+9 seconds'), datetime('now','-41 minutes')),
  ('st_2_1', 'run_2', 'n1', 'query', 1, 'succeeded', '{"overdue_days":14}', '{"rows":6}', NULL, datetime('now','-2 hours'), datetime('now','-2 hours','+4 seconds')),
  ('st_2_2', 'run_2', 'n2', 'filter',2, 'succeeded', '{"rows":6}', '{"rows":6}', NULL, datetime('now','-2 hours','+4 seconds'), datetime('now','-2 hours','+5 seconds')),
  ('st_2_3', 'run_2', 'n3', 'email', 3, 'succeeded', '{"rows":6}', '{"sent":6}', NULL, datetime('now','-2 hours','+5 seconds'), datetime('now','-2 hours','+38 seconds'))
ON CONFLICT DO NOTHING;
