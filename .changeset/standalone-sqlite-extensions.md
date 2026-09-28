---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-standalone': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-bun-sqlite': patch
---

A standalone build of a SQLite app now ships its `db.sqliteExtensions` (sqlite-vec's vec0 by default) inside the artifact, so a migration or query that uses them works in production the way it does under `pikku dev`. The node bundle loads them from `sqlite-extensions/` beside itself; a compiled bun binary embeds them and writes them out under `$PIKKU_DATA_DIR/.pikku-sqlite-extensions/` on start. The libraries are the build machine's, so an extension that cannot be resolved there fails the build; `[]` builds without them.

`createNodeSqliteKysely` and `createBunSqliteKysely` take an `extensions` list of library paths to load into the connection.
