---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/addon-console': patch
'@pikku/migrator-sql': patch
'@pikku/deploy-standalone': patch
'@pikku/skills': patch
---

Column constraints in `db/tables.ts` are real. `enum`, `min`, `max`, `minLength` and `maxLength` always reach the generated zod schema, the generated union types and `pikku meta db` / the console schema, and `pattern` reaches zod only. On Postgres and MySQL they also become named inline `CHECK`s on new tables, new columns and existing columns, and the introspectors read checks back on postgres, sqlite and MySQL. A name too long for the engine keeps its `_<kind>_check` ending and a short hash in the middle.

SQLite gets no generated `CHECK`: it cannot change one without rebuilding the table, so the constraints there are validation only. `pikku db generate` and `pikku db check` print one notice listing each declared constraint with the `CHECK` to add in a hand-written migration, suppressible with `validate.rules["db-sqlite-unenforced-constraints"] = "off"`. A `CHECK` written by hand in a sqlite migration is left alone and still types the column.

Adding, changing or removing a constraint on an existing Postgres or MySQL column is written instead of refused: `ADD`/`DROP CONSTRAINT` on postgres and `ADD CONSTRAINT`/`DROP CHECK` on MySQL 8.0.16+ (older servers are refused up front from the declaration), each added check carrying a `-- pikku:check-probe` line that `migrate` runs against the live rows first, through `checkProbeHook` (the MySQL probe is bounded by `max_execution_time`). `migrate` now refuses a pending migration marked `-- pikku:destructive` unless `allowDestructive` is given (`pikku db migrate --allowDestructive`, the standalone bundle's `db migrate --allow-destructive`); `pikku ci` passes it only inside its throwaway worktree. On bun, `exec` now runs each sqlite statement on its own with a sqlite-specific splitter, because bun:sqlite drops a statement's error whenever anything follows it, which let a failed migration be recorded as applied.

A declared constraint is enforced at runtime only where a function uses the generated zod (`<Table>InsertZ`, `PatchZ`, `Z`) as its `input`; a Kysely write that skips such a function is guarded only by the DB `CHECK`s on Postgres and MySQL, and on SQLite not at all. Whole-number columns (`integer`, `bigint`, `smallint`, `serial`) are now generated as `z.number().int()`. When a declared `enum` differs from the enum the database holds, the generated union follows the declaration and codegen warns once per column (`PKU488`, run `pikku db generate` for the corrective migration); this replaces the database silently winning.
