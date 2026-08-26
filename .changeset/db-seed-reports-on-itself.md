---
'@pikku/cli': patch
---

`pikku db reset` and `fabric validate` stop treating an absent dev seed as an empty database

The seed step reported a conclusion about the database rather than about
itself: with no `db/sqlite-dev-seed.sql`, reset finished with `database is
empty` even when a migration had just populated it, and `--no-seed` said the
same. Both lines now name the step — `no dev seed applied (…)` and `--no-seed,
skipping the dev seed`.

`fabric validate` raised `dev-seed-sql-missing` at **error** severity, so a
project that had correctly moved its rows into a migration — where anything a
deployed stage needs has to live, since Fabric never replays the dev seed — was
failed for no longer carrying a file it deliberately does not need. It is now
`info`, and the hint says what the file is for instead of advising an idempotent
form the framework tells you not to reach for.
