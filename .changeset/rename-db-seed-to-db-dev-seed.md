---
'@pikku/cli': patch
'@pikku/skills': patch
---

Rename `pikku db seed` to `pikku db dev-seed`, and make it refuse to run in production.

`seed` read like something you might point at any environment. It never was. It exists
for one job: put enough test data into a **dev** database that the app isn't empty on
first run. Production and staging are provisioned, not seeded — accounts and their role
grants come from `pikku persona sync` or a migration, and always have.

The name now says so, and so does the command: it throws on `NODE_ENV=production`, the
same guard `pikku db reset` already carried. Previously only `reset` refused; `seed`
would happily run wherever it was pointed, despite being documented as dev-only.

The seed file moves with the name:

- `db/postgres-seed.sql` → `db/postgres-dev-seed.sql`
- `db/sqlite-seed.sql` → `db/sqlite-dev-seed.sql`

**Migrating:** rename the file. A project that keeps the old name gets no error — the
command reports "nothing to do" and a reset produces an empty database, which is the
one failure mode worth knowing about up front. The Fabric validator's
`seed-sql-missing` finding is now `dev-seed-sql-missing` and looks for the new name.
