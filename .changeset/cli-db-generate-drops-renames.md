---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/skills': patch
---

`pikku db generate` writes a `DROP COLUMN` or `DROP TABLE` for a column or recorded table that left `db/tables.ts`, once a person approves: on a terminal it lists each drop and asks, anywhere else it refuses until `--allowDestructive` is given. Every drop is marked `-- pikku:destructive` and written in its own file after the additions, so `pikku db migrate` stops on it again until it is given `--allowDestructive`. A drop is rehearsed first and never `CASCADE`: one the engine refuses (a column a sqlite `UNIQUE` key holds, a table another table references) is refused with the engine's reason. `renamedFrom: 'old_name'` on a column writes `RENAME COLUMN` and keeps the rows, with no approval; delete it once applied. On Postgres and MySQL a renamed column's generated checks are dropped before the rename and re-added in the next file, because MySQL refuses to rename a column a `CHECK` uses. `renamedFrom` is refused on a column in a key, an index or a reference. A table rename is not supported, and a changed column type or `NOT NULL` on an existing column is still refused. Breaking behaviour is documented in `docs/MIGRATION.md`.
