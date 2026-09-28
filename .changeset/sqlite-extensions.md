---
'@pikku/cli': patch
---

New `db.sqliteExtensions` in pikku.config.json: loadable SQLite extensions loaded into every SQLite connection the CLI opens (migrations, the shadow database, the dev server, the seed and scenario baselines). It defaults to `['sqlite-vec']`, which the CLI now ships, so `CREATE VIRTUAL TABLE ... USING vec0(...)` works in `pikku dev` with no configuration. `[]` opts out. An entry is a package exporting `getLoadablePath()` or a path to the extension's library file.

A runtime that cannot load extensions (bun on macOS, whose system SQLite is built without it) skips the default rather than failing, and a migration that then needs vec0 says why it is missing. A declared extension that cannot be loaded is an error. Codegen no longer types the shadow tables a virtual table keeps its data in (fts5's, vec0's).
