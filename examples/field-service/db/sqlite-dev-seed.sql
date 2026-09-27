-- Dev seed (applied via `pikku db reset` after `pikku db migrate`).
--
-- TWO companies, not one. Every multitenant claim this example makes is only
-- worth anything if a second tenant's rows are sitting in the same tables
-- waiting to leak, so Southgate exists purely to be invisible to Northwind.

INSERT INTO company (company_id, name, slug) VALUES
  ('co_northwind', 'Northwind Heating', 'northwind'),
  ('co_southgate', 'Southgate Electrical', 'southgate')
ON CONFLICT DO NOTHING;

-- The invitation list. `scenarios.emailDomain` in pikku.config.json is what
-- turns the persona id `dana` into dana@actors.local, so these addresses are
-- the same ones the actors sign in with.
INSERT INTO membership (membership_id, company_id, email) VALUES
  ('mem_dana',  'co_northwind', 'dana@actors.local'),
  ('mem_theo',  'co_northwind', 'theo@actors.local'),
  ('mem_casey', 'co_northwind', 'casey@actors.local'),
  ('mem_maya',  'co_southgate', 'maya@actors.local')
ON CONFLICT DO NOTHING;

INSERT INTO customer (customer_id, company_id, name, address, phone, email) VALUES
  ('cus_ashfield', 'co_northwind', 'Ashfield Primary School', '2 Ashfield Lane, Leeds LS8 2QP', '0113 496 0112', 'site@ashfield.example'),
  ('cus_harrow',   'co_northwind', 'Harrow Court Flats',      '14 Harrow Court, Leeds LS6 1RT', '0113 496 0187', 'block@harrowcourt.example'),
  ('cus_mercer',   'co_southgate', 'Mercer & Daughters',      '9 Trinity Row, Sheffield S1 4QJ', '0114 220 7741', 'ops@mercer.example')
ON CONFLICT DO NOTHING;

INSERT INTO technician (technician_id, company_id, email, name, skills, is_active) VALUES
  ('tec_theo',  'co_northwind', 'theo@actors.local', 'Theo Bright',   '["gas","boiler"]', 1),
  ('tec_rosa',  'co_northwind', NULL,                'Rosa Kandel',   '["boiler","plumbing"]', 1),
  ('tec_iver',  'co_southgate', NULL,                'Iver Lassiter', '["electrical"]', 1)
ON CONFLICT DO NOTHING;

-- Deliberately uneven: one job with no technician (so the dispatch screen has
-- something to dispatch), one overdue (so the sweep has something to find), and
-- one belonging to the other tenant.
INSERT INTO job (job_id, company_id, customer_id, technician_id, title, description, status, priority, scheduled_for, created_at, updated_at) VALUES
  ('job_boiler',   'co_northwind', 'cus_ashfield', 'tec_theo', 'No heat in the west wing',   'Boiler locks out on start. Fault code E119.', 'scheduled',   'urgent', datetime('now','+1 day'),  datetime('now','-2 day'), datetime('now','-2 day')),
  ('job_radiator', 'co_northwind', 'cus_harrow',   NULL,        'Radiators cold on top floor', 'Likely airlock, three flats affected.',      'new',         'normal', NULL,                       datetime('now','-1 day'), datetime('now','-1 day')),
  ('job_overdue',  'co_northwind', 'cus_harrow',   'tec_rosa',  'Annual service, block B',     'Missed twice already.',                      'scheduled',   'normal', datetime('now','-3 day'),   datetime('now','-9 day'), datetime('now','-9 day')),
  ('job_consumer', 'co_southgate', 'cus_mercer',   'tec_iver',  'Consumer unit replacement',   'Board is a rewireable fuse box.',            'in_progress', 'normal', datetime('now'),            datetime('now','-4 day'), datetime('now','-4 day'))
ON CONFLICT DO NOTHING;

INSERT INTO quote (quote_id, company_id, job_id, amount_cents, summary, status) VALUES
  ('quo_boiler', 'co_northwind', 'job_boiler', 148000, 'Replace ignition PCB and flue sensor', 'awaiting_approval')
ON CONFLICT DO NOTHING;
