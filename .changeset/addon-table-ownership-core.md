---
'@pikku/cli': minor
---

Add the deterministic core for addon DB-table ownership (foundation for `pikku new addon --filter`):

- `discoverOwnedTables` — compile-oracle that infers the exact tables a set of functions uses by typing kysely as `Kysely<Pick<DB, …>>` and reading the still-missing tables from TS2345 spans (generalizes across `selectFrom`/`insertInto`/joins/etc.).
- `checkForeignKeyClosure` — rejects an addon whose owned table foreign-keys into a table it does not own.
- `diffTablesToSql` — additive-only migration emitter (CREATE missing tables, ADD missing columns; warns — never alters/drops — on type changes and dropped columns), serving both generation (empty target) and install-time diffs.
- `checkRawSqlOwnership` — gate that refuses to bundle a function whose table ownership can't be determined from types (kysely `sql` tag / `sql.raw`/`sql.table` / `CompiledQuery.raw`), since those escape the oracle silently. `db.dynamic.table()` is intentionally not gated — kysely type-checks it, so a missing table surfaces as a loud residual instead. Wired into `pikku new addon --filter`.
