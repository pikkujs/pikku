-- Dev seed (applied via `pikku db reset` after `pikku db migrate`).
--
-- Posts across every status, because the point of this template is that the
-- public read compares `published_at` against now rather than trusting
-- `status` alone. A seed with only published posts cannot show that a scheduled
-- post stays invisible until its time, which is the behaviour most likely to
-- be got wrong.

INSERT INTO author (author_id, name, slug, bio) VALUES
  ('aut_mira', 'Mira Halloran', 'mira-halloran', 'Writes about the parts of infrastructure nobody photographs.'),
  ('aut_jon',  'Jon Adeyemi',   'jon-adeyemi',   'Editor. Believes most drafts are one paragraph too long.')
ON CONFLICT DO NOTHING;

INSERT INTO post (post_id, author_id, title, slug, excerpt, body, status, published_at, reading_minutes) VALUES
  ('pst_ledger', 'aut_mira', 'The ledger nobody reads until it matters',
   'the-ledger-nobody-reads',
   'Audit logs are written for a reader who does not exist yet, under conditions you cannot predict.',
   'Audit logs are written for a reader who does not exist yet, under conditions you cannot predict. That makes them unusual among the things we build: there is no feedback loop, no analytics, nobody filing a bug when a field turns out to be useless. You find out whether the log was any good on the worst day of the quarter.' || char(10) || char(10) || 'Which suggests a discipline. Write down what happened, who caused it, and what the state was before — not what you think somebody will want to filter on.',
   'published', datetime('now','-3 days'), 6),

  ('pst_queues', 'aut_mira', 'Queues are not a performance feature',
   'queues-are-not-performance',
   'Putting work in a queue does not make it faster. It makes the failure somebody else''s problem, later.',
   'Putting work in a queue does not make it faster. It moves the failure somewhere you are not looking, and delays it until the context that would have explained it is gone.' || char(10) || char(10) || 'The reason to use a queue is that the work must survive the process that asked for it. That is the whole argument. Everything else — throughput, smoothing, retries — follows from durability, and none of it follows from wanting the request to return sooner.',
   'published', datetime('now','-11 days'), 4),

  ('pst_naming', 'aut_jon', 'On naming things after what they are',
   'naming-things-after-what-they-are',
   'A name that describes the mechanism ages badly. A name that describes the job survives the rewrite.',
   'A name that describes the mechanism ages badly, because the mechanism is the part most likely to change. `RedisSessionCache` becomes a lie the week you move to Postgres, and the lie is load-bearing by then: it is in imports, in log lines, in three runbooks.' || char(10) || char(10) || 'Name the job. `SessionStore` is still true after the rewrite.',
   'published', datetime('now','-28 days'), 3),

  ('pst_rollback', 'aut_jon', 'Rollbacks are a design constraint, not a button',
   'rollbacks-are-a-design-constraint',
   'You cannot add the ability to go back afterwards. It is decided by the shape of the change.',
   'You cannot add the ability to go back afterwards. Whether a deploy is reversible was decided earlier, by whether the change was additive — and by then the decision is already in a migration file.',
   'scheduled', datetime('now','+2 days'), 5),

  ('pst_draft', 'aut_mira', 'Untitled — the retry piece',
   'untitled-retry-piece',
   NULL,
   'Notes only. Something about how retrying a non-idempotent operation is not a retry, it is a second operation wearing the first one''s name.',
   'draft', NULL, 1),

  -- A second draft, reserved for the coverage scenario. Without it the coverage
  -- run and the browser journey compete for the same one: whichever publishes
  -- first leaves the other asserting against an empty editorial queue.
  ('pst_probe', 'aut_jon', 'Draft reserved for coverage',
   'draft-reserved-for-coverage',
   NULL,
   'Published and re-published by the coverage scenario. Not editorial content.',
   'draft', NULL, 1),

  ('pst_old', 'aut_jon', 'What we got wrong about caching',
   'what-we-got-wrong-about-caching',
   'Archived — superseded, and kept so the links still resolve.',
   'Superseded by later work. Kept because the links still resolve and a dead link is worse than an out-of-date opinion.',
   'archived', datetime('now','-400 days'), 7)
ON CONFLICT DO NOTHING;

INSERT INTO tag (tag_id, name, slug) VALUES
  ('tag_infra',   'Infrastructure', 'infrastructure'),
  ('tag_craft',   'Craft',          'craft'),
  ('tag_ops',     'Operations',     'operations')
ON CONFLICT DO NOTHING;

INSERT INTO post_tag (post_id, tag_id) VALUES
  ('pst_ledger', 'tag_infra'), ('pst_ledger', 'tag_ops'),
  ('pst_queues', 'tag_infra'),
  ('pst_naming', 'tag_craft'),
  ('pst_rollback','tag_ops'),
  ('pst_old',    'tag_infra')
ON CONFLICT DO NOTHING;

INSERT INTO post_view (post_id, views) VALUES
  ('pst_ledger', 4120),
  ('pst_queues', 9863),
  ('pst_naming', 2314),
  ('pst_old',    17402)
ON CONFLICT DO NOTHING;
