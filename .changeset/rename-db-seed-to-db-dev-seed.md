---
'@pikku/cli': patch
'@pikku/skills': patch
---

Remove `pikku db seed`. Seeding is now a step of `pikku db reset`, which grew `--no-seed`.

`seed` read like something you might point at any environment. It never was. It exists
for one job: put enough test data into a **dev** database that the app isn't empty on
first run. Production and staging are provisioned, not seeded — accounts and their role
grants come from `pikku persona sync` or a migration, and always have.

A standalone seed command is also what made seed files unpleasant to write. Because it
could be run against a database in any state, every seed had to defend itself with
`INSERT OR IGNORE`, `ON CONFLICT DO NOTHING`, `IF NOT EXISTS`. Folding it into reset
removes that: `pikku db reset` wipes, migrates, then seeds, so the seed only ever meets
an empty database and **plain `INSERT`s are correct**. The guarantee is structural now
rather than a documented convention.

```bash
pikku db reset             # wipe + migrate + test data
pikku db reset --no-seed   # wipe + migrate, empty — for empty-state and onboarding work
```

Seeding also inherits reset's guards for free: it refuses `NODE_ENV=production`, and
refuses a database resolved outside the runtime directory.

The seed file keeps a name that says what it is:

- `db/postgres-seed.sql` → `db/postgres-dev-seed.sql`
- `db/sqlite-seed.sql` → `db/sqlite-dev-seed.sql`

**Migrating:** rename the file, and drop the idempotency guards from it if you like.
`pikku db seed` no longer exists — use `pikku db reset`. A project that keeps the old
filename gets no error: reset reports the database is empty, which is the one failure
mode worth knowing about up front. The Fabric validator's `seed-sql-missing` finding is
now `dev-seed-sql-missing` and looks for the new name.
