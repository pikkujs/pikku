---
'@pikku/kysely-bun-sqlite': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-sqlite': patch
---

Make user-defined SQL functions an explicit, checked capability of the SQLite drivers.

`node:sqlite` can register scalar UDFs (`db.function()`); `bun:sqlite` cannot. Until now
neither driver mentioned that, so an app that registered a UDF by reaching for the raw
connection worked on Node and, on bun, failed as `no such function: …` from whichever
query used it — typically one endpoint breaking in production while everything else
looked healthy.

Both drivers now export `registerSqliteFunctions(db, functions)` and accept a
`functions` option on `createNodeSqliteKysely` / `createBunSqliteKysely`. The Node
implementation registers them as deterministic; the bun implementation throws
`SqliteFunctionsUnsupportedError` — exported from `@pikku/kysely-sqlite`, and naming
every function requested — so the incompatibility surfaces at wiring time with a message
saying what to do about it.
