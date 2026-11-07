---
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/migrator-sql': patch
'@pikku/skills': patch
---

An app can declare its tables and their annotations in `db/tables.ts` with `defineTables`, and `pikku db generate` writes the SQL. It adds new tables, columns and indexes, adopts tables the migrations already create, and refuses a drop, a rename or a changed column with the reason, writing nothing. `pikku db migrate` and `pikku db check` stop when the declaration is ahead of the migrations. New `pikku meta db`, and a `db` block in `pikku meta context`, say where tables are declared. Opt-in by the presence of the file; an app with hand-written migrations is unchanged. See docs/db-tables.md and docs/MIGRATION.md.
