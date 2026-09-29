---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
'@pikku/mongodb': patch
---

The workflow run lock now runs on `LockService`. Postgres and MySQL default to a `KyselyLockService` on the same database in place of `pg_advisory_lock` / `GET_LOCK`, so it pins no connection and a lost holder's lease lapses on its own. Other services pass through unless given a `lockService`.

`PgWorkflowQueueOptions` is gone: `lockDb`, `lockIdleTimeoutMs`, `lockTimeoutMs` and `maxLockHoldMs` become `runLock: { ttlMs, waitMs, pollMs, maxHoldMs }`. `RunLockHoldTimeoutError` becomes `LockHoldTimeoutError` from `@pikku/core/services`. Workflow apps need the `pikku_lock` table: run `pikku db generate` and migrate before upgrading.
