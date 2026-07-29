---
'@pikku/cli': patch
---

`pikku db generate` now writes a wholly-new table from the source's own SQL, instead of rendering it from a column list.

When a schema source the migrations already cover grows a table — enabling a Better Auth plugin, upgrading an addon, a new `@pikku/kysely` runtime service — the generator took the diff path, which only had names and types to work from. The table it emitted had no primary key, no foreign keys and no indexes, and carried a `-- REVIEW:` note telling you to go copy the real statement by hand. Applied unreviewed, which is what an automated build does, it left a permanently degraded table.

The source already ships the correct DDL, and the first-time path already used it. Now the new-table case does too: its `CREATE TABLE`, its indexes and any `ALTER TABLE` that constrains it are lifted out of the source's SQL in the order it wrote them. Column-level changes to a table that already exists still go through `ALTER TABLE … ADD COLUMN`, and the `-- REVIEW:` note for a `NOT NULL` column with no default is unchanged.
