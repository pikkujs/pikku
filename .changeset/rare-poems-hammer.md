---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
---

fix(kysely): claim a workflow step atomically in every SQL dialect

The workflow engine's "atomic claim" was a read-then-write guarded by
`withStepLock`, and `@pikku/kysely` inherited a silent pass-through for that
lock — so on every dialect but Postgres and MySQL a redelivered queue job could
claim a step another dispatch was already running, executing a side-effecting
step twice.

`@pikku/kysely` now claims the step with a status-guarded `UPDATE` and reads the
affected-row count, which is atomic in every SQL dialect without an
advisory-lock primitive. Relay redispatch is enabled for all Kysely dialects as
a result, not just Postgres and MySQL.
