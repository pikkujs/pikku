---
'@pikku/cli': patch
---

`pikku db migrate` now fails when a migration declares a camelCase column or table.

Pikku's Kysely runs with `CamelCasePlugin`, so `priceCents` in TypeScript is `price_cents` in SQL and nothing else. A migration that spells the column `priceCents` half-works, which is what made it expensive: `.selectAll()` compiles to `SELECT *` and never names an identifier, so the table reads back perfectly, while the first query that names the column asks for `price_cents` and gets `no such column`. The plugin looks broken, and the fix looks like a raw `sql` template.

Every `.sql` file in the migrations directory is now parsed before anything is applied, and every camelCase identifier a `CREATE TABLE` column list or an `ALTER TABLE … ADD COLUMN` declares is reported at once with its file, table and snake_case name. Comments, string literals, quoted identifiers and nested parens (`NUMERIC(10,2)`, `CHECK (…)`) are all read as SQL rather than as text, so prose mentioning `createdAt` does not trip it.

There is no exception to opt out of. The generated Better Auth schema is snake_case for the same reason, because Better Auth is handed the app's own Kysely.
