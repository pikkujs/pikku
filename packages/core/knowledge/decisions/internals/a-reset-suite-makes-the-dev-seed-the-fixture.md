---
type: decision
title: With scenarios.reset on, the dev seed is the fixture every assertion is written against
description: The rollback restores the database as the suite found it, so seed rows are the shared baseline — which makes an absolute date in the seed a test that expires
tags: cli, scenarios
---

# A reset suite makes the dev seed the fixture

`scenarios.reset` takes a copy of every table when the suite starts and restores
that copy between scenarios. It is a snapshot-and-restore, not a
truncate-and-reseed: nothing replays the seed file, and nothing regenerates its
rows.

Two things follow, and both are easy to get wrong.

**The seed is the fixture.** Before a reset was available, a project usually had
a hand-rolled reset RPC that wiped and re-created the handful of rows its
scenarios touched. That RPC was the fixture and the seed was scenery. With the
rollback on, the whole seed is in scope — every booking, invoice and event a
developer put there for their own convenience is now a row some scenario can
count. Assertions written as counts against the old narrow fixture go wrong the
moment the baseline widens.

**A date literal in the seed expires.** A seed is applied once, and from then on
the restore keeps handing back the same rows. Write `'2026-03-14'` and the
fixture is correct on the day it was written and quietly wrong a month later —
the booking that was supposed to be upcoming is in the past, and the scenario
that asserts on it fails for a reason that has nothing to do with the code. Seed
dates belong relative to the moment the seed is applied:

```sql
INSERT INTO booking (id, starts_at, ends_at) VALUES
  ('b_upcoming', date('now', '+200 days'), date('now', '+207 days')),
  ('b_ended',    date('now', '-8 days'),   date('now', '-1 days'));
```

`date('now', ...)` in sqlite, `now() + interval '200 days'` in postgres. Pick the
offsets so each row sits unambiguously on the side of whatever boundary the
scenarios test, rather than a day away from it.

There is a third limit worth stating plainly: the baseline is the database _as
the suite starts_, so it is not a pristine seed. Run N+1 inherits whatever run N
left behind. A value that must be unique in the database — an invoice number, a
reference code — has to be scoped to the run, not hard-coded, or the second run
collides with the first.

**What this rules out:** treating the reset as "the suite starts from the seed
every time". It starts from wherever the database was, and keeps returning
there.
