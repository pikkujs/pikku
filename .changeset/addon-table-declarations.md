---
'@pikku/cli': patch
'@pikku/skills': patch
---

An addon declares its tables with `defineTables` in its own `db/tables.ts`, and `pikku db export` publishes the declaration as JSON instead of SQL per dialect (no database or `db.mysqlUrl` needed). The app's `pikku db generate` merges each wired addon's declaration with `db/tables.ts` and plans it once, so addon tables get derived SQL, annotations, constraints and approval-gated drops and renames. Table names need the addon's wired prefix, a name declared twice is refused, and an old SQL-per-dialect artifact is refused with "rebuild or upgrade the addon". `db migrate`, `check`, `codegen` and `reset` now read the wired addons through the inspector. See docs/MIGRATION.md.
