---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/cli': patch
---

`db/tables.ts` is now the plain declaration: `defineTables({ table: { columns } })` from `@pikku/core/db`, with annotations on the columns. The old `{ statements, requires, annotations }` shape is refused with a pointer to `docs/MIGRATION.md`, and `defineTables`, `requiredType`, `AppTables`, `SchemaStatementFactory` and `ForeignKeyTarget` are removed from `@pikku/kysely`. A table marked `declareOnly: true` is typed and annotated from the declaration without any SQL generated for it, and its columns are checked against the table the migrations create. `pikku meta db` lists those tables separately.
