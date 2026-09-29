---
'@pikku/core': patch
'@pikku/kysely': patch
---

Add `LockService`: named, lease-based locks shared by every process on the same store. `acquire` never blocks and answers `null` while someone else holds the key; a lease lapses on its own if its holder dies; and each lease carries a `token` that rises every time the lock changes hands, so a stale holder cannot refresh or release its successor's lease. Ships as `InMemoryLockService` and `KyselyLockService` on `pikku_lock`; run `pikku db generate` once a function reaches `lockService`.
