# Fabric database: SQLite via libSQL

## Contents

- Setup in `services.ts`
- Migrations
- Dev seed data
- Column conventions

Fabric apps use SQLite, accessed via Kysely with the libSQL HTTP adapter. NOT PostgreSQL, NOT D1.

## Setup in `services.ts`

```typescript
import { Kysely, CamelCasePlugin } from 'kysely'
import { LibsqlWebDialect } from '@pikku/kysely-sqlite'
import type { DB } from '#pikku/db/schema.gen.js'

const databaseUrl = await variables.get('DATABASE_URL')
let kysely: Kysely<DB>
if (databaseUrl) {
  kysely = new Kysely<DB>({
    dialect: new LibsqlWebDialect({ url: databaseUrl }),
    plugins: [new CamelCasePlugin()],
  })
} else if (existingServices?.kysely) {
  kysely = existingServices.kysely as Kysely<DB>
} else {
  throw new Error('kysely not provided and DATABASE_URL is unset')
}
```

Fabric injects `DATABASE_URL` as a variable binding when the stage starts. In local dev, `pikku db migrate` uses a local `dev.db` SQLite file.

## Migrations

Migrations are plain `.sql` files at the **project root**, in a directory named
for the engine — `db/sqlite/` for SQLite/libSQL stages, `db/postgres/` for
Postgres ones. Never `db/migrations/`, and never under `packages/functions/`:
the deploy pipeline stages `db/<engine>/*.sql` from the root and applies them
after upload, so a migration anywhere else is silently never run.

```
db/sqlite/
  0001-init.sql
  0002-add-users.sql
```

Numbers must be consecutive and gap-free, and an applied migration is frozen —
correct a mistake with a new forward migration, never by editing or renaming one
that has already run (the recorded hash will no longer match).

**Forward-only rule.** Once a migration exists on the base branch (or any stage
has applied it), never edit, rename or delete it — add a NEW numbered migration
that makes the change. A stage records a migration by name and never re-runs it,
so an edit never reaches a database that already applied it. Two guards enforce
this:

- `pikku fabric validate` reports `migration-modified-after-base-*` (error) for
  any `db/<engine>/*.sql` that exists on the base ref (default `origin/main`, else `main`, `origin/master`, `master`,
  compared at the branch's merge-base; override with `--migrations-base <ref>`
  or `PIKKU_MIGRATIONS_BASE`) but was modified, deleted or renamed in the working
  tree. New files are fine. It is skipped outside a git repo or with no base ref.
  In CI use a full clone (`fetch-depth: 0`) so the base ref exists.
- `pikku fabric deploy apply` runs the migration-history checks first and
  refuses to create a deployment if any fail. It compares against the stage
  being deployed and the production (`main`) stage's applied ledger, and against
  the base ref — a branch stage can be reset at will, but main's history reaches
  production. Findings: `migration-applied-file-missing-*`, `migration-drift-*`,
  `migration-gap`, `migration-modified-after-base-*`. Unlike `validate`, a check
  that cannot run refuses too: an unreadable ledger (`migration-drift-unchecked`)
  or a base ref that does not resolve (`migration-base-unresolved`). There is no
  override flag — fix the history.

Fix a finding by restoring the file (`git checkout origin/main -- db/sqlite/<file>`)
and putting the change in a new migration.

Run migrations: `pikku db migrate`. It also regenerates `.pikku/db/schema.gen.ts`
(Kysely types) and `.pikku/db/zod.gen.ts` — there is no separate types step.

**NEVER hand-edit the generated schema** — write a migration and re-run.

## Dev seed data

Alongside the migrations sits `db/<engine>-dev-seed.sql` — `db/sqlite-dev-seed.sql`
or `db/postgres-dev-seed.sql`. There is no seed command. `pikku db reset` is the
only thing that applies it: wipe, migrate, seed. `--no-seed` stops after the
migration, for working on an empty-state or onboarding flow the test data hides.

Because reset always arrives at a database it has just wiped, **the seed file is
plain `INSERT`s** — no `INSERT OR IGNORE`, no `ON CONFLICT DO NOTHING`, no
`IF NOT EXISTS`. Nothing applies it twice, so it never has to defend itself. If
you find yourself reaching for an idempotent form, that's a sign the data wants
to be a migration instead.

This is **local dev data only**: enough rows that a fresh dev database isn't an
empty app. Nothing else ever runs it. A deployed stage applies `db/<engine>/*.sql`
and stops there — the one exception is a disposable stage deployed with
`pikku fabric deploy apply <branch> --reset` (see `deploy.md`), which is never
production. Local reset refuses `NODE_ENV=production` and refuses a database
outside the runtime directory.

So the test is not "is this row realistic?", it is **"would the app be broken
without it in production?"** If yes, it is configuration and belongs in a
migration, however much it looks like sample data. A venue and its rooms, a
product catalogue, a tenant, a country list, the organization the whole
deployment hangs off — all configuration. Accounts and role grants are
provisioning: the fabric plugin's `personas`, or a migration. What is left
over is the seed's job — the bookings, orders and messages a demo needs and a real
environment starts without.

Get this wrong and it hides: the app is perfect locally, where reset has just
run, and every deployed environment comes up with empty tables. The signature is
a stage whose pages return 200 — the shell renders fine — while its first data
read throws `no result` or a foreign-key violation on a row the seed was
silently supplying.

A Better Auth app has a second constraint: the plugins you enable (`pikkuBan()`,
`pikkuActor()`, …) each declare columns, and `pikku db migrate` refuses to run while
the applied schema is missing any of them. `pikku db generate` writes the
migration that closes the gap.

## Column conventions

- Use `SERIAL`/`INTEGER PRIMARY KEY AUTOINCREMENT` for IDs
- Use `TEXT` for strings, `INTEGER` for booleans (0/1) and timestamps (Unix ms)
- Use `CHECK` constraints sparingly — prefer app-level validation
- Table and column names: snake_case in SQL, camelCase in TypeScript (via `CamelCasePlugin`)
