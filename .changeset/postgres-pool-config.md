---
'@pikku/core': patch
---

feat(config): add optional `postgres` pool config to `CoreConfig`

Postgres is a first-class adapter, so its runtime pool tuning now lives in the
core config (sibling to `workflow`), typed via the new `PostgresConfig`:
`maxPool`, `connectTimeout`, `idleTimeout`, `maxLifetime`, `statementTimeout`,
`prepare`. The connection string itself stays the flat `postgresUrl`/`sqliteDb`
field the CLI db commands read; this block is purely runtime pool options.
