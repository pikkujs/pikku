---
'@pikku/migrator-sql': patch
---

`SqliteRuntime.open` takes an `extensions` option: absolute paths of loadable SQLite extensions to load into the connection. On bun, `exec` now fails with `no such module: <name>` for a `CREATE VIRTUAL TABLE` over a module that is not loaded; bun:sqlite drops that error whenever anything follows the statement, which let such a migration be recorded as applied without its table.
