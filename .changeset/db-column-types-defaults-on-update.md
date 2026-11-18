---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/migrator-sql': patch
'@pikku/deploy': patch
---

Database declarations: a column typed `bigint` reads as a number and throws above `Number.MAX_SAFE_INTEGER`; an undeclared `int8` or `numeric` reads as a string and `bytea` as `Uint8Array`; a `declareOnly` column's `type` is optional and derived from the database, and a `type`, `tsType` or `kind` that disagrees with the real column is an error. `default` and `onUpdate` take `{ now: true }`, `{ uuid: true }` (default only), a literal or `{ sql: { postgres?, mysql?, sqlite? } }`, spelled for the configured engine, with `onUpdate` generated as a Postgres trigger, a SQLite trigger or a MySQL column attribute. `default: { sql }` and an index `where` now take the per-engine object (breaking, see docs/MIGRATION.md).
