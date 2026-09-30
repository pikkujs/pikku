---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
---

Add `LeaseService`: named leases shared by every process on the same store. A lease is not a mutex: a holder that stalls past its expiry loses the key without knowing, so whatever the body writes to should check the lease's `token` and refuse an older one. `acquire` never blocks and answers `null` while someone else holds the key; a lease lapses on its own if its holder dies; and each lease carries a `token` that rises every time the key changes hands, so a stale holder cannot refresh or release its successor's lease. `holdLease` refreshes the lease while its body runs, hands the body an `AbortSignal` that fires the moment the lease is lost, and throws `LeaseLostError` once the body finishes if the lease lapsed or changed hands meanwhile, so a caller never takes that result as produced under the lease.

Ships as `InMemoryLeaseService`, `PgKyselyLeaseService` (`@pikku/kysely-postgres`), `MySQLKyselyLeaseService` (`@pikku/kysely-mysql`) and `KyselyLeaseService` (SQLite), all on `pikku_lease`. The Postgres and MySQL services judge every lease by the database's clock, so a worker whose clock runs fast cannot take a live lease or stretch its own; `KyselyLeaseService` reads the process clock and is for a single-host SQLite app. `pikku db generate` writes the table for any project that reaches `leaseService`.
