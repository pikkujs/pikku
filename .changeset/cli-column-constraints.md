---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/addon-console': patch
'@pikku/migrator-sql': patch
'@pikku/deploy-standalone': patch
'@pikku/skills': patch
---

Column constraints in `db/tables.ts` are real. `enum`, `min`, `max`, `minLength` and `maxLength` become named inline `CHECK`s on new tables and new columns, `pattern` and the bounds reach the generated zod schema, and the introspectors read checks back on postgres, sqlite and MySQL. `pikku meta db` and the console schema show each column's constraints.

Adding, changing or removing a constraint on an existing column is written instead of refused: `ADD`/`DROP CONSTRAINT` on postgres, MySQL 8.0.16+ and MariaDB 10.2+ (each added check carries a `-- pikku:check-probe` line that `migrate` runs against the live rows first, through `checkProbeHook`), and a table rebuild on sqlite that copies rowids and the AUTOINCREMENT sequence. A rebuild is marked `-- pikku:destructive` and `-- pikku:foreign-keys-off`: `migrate` now refuses a pending destructive migration unless `allowDestructive` is given (`pikku db migrate --allowDestructive`, the standalone bundle's `db migrate --allow-destructive`), and the sqlite migrator runs foreign-keys-off migrations statement by statement with enforcement off and refuses to commit a broken foreign key or a lost index, trigger or view. On bun, `exec` now runs each sqlite statement on its own with a sqlite-specific splitter, because bun:sqlite drops a statement's error whenever anything follows it, which let a failed migration be recorded as applied.
