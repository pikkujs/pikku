---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
---

Add `LockService`: named, lease-based locks shared by every process on the same store. `acquire` never blocks and answers `null` while someone else holds the key; a lease lapses on its own if its holder dies; and each lease carries a `token` that rises every time the lock changes hands, so a stale holder cannot refresh or release its successor's lease. `withLock` refreshes the lease while its body runs, hands the body an `AbortSignal` that fires the moment the lease is lost, and throws `LockLostError` once the body finishes if the lease lapsed or changed hands meanwhile, so a caller never takes that result as produced under the lock.

Ships as `InMemoryLockService`, `PgKyselyLockService` (`@pikku/kysely-postgres`), `MySQLKyselyLockService` (`@pikku/kysely-mysql`) and `KyselyLockService` (SQLite), all on `pikku_lock`. The Postgres and MySQL services judge every lease by the database's clock, so a worker whose clock runs fast cannot take a live lease or stretch its own; `KyselyLockService` reads the process clock and is for a single-host SQLite app. `pikku db generate` writes the table for any project that reaches `lockService`.
