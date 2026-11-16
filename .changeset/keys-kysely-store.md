---
'@pikku/kysely': patch
'@pikku/core': patch
---

`@pikku/kysely` adds `KyselyKeyStore`, a `KeyStore` (from `@pikku/core/keypair`) on a new `pikku_key` table, and `keySchema`. The schema is gated on `keyService`, so `pikku db generate` writes the table only for an app whose functions destructure `keyService`; `init()` fails with the usual "run `pikku db generate`" message when it is missing. One active and one pending key per name and scope are unique indexes over two nullable slot columns, `rev` is the compare-and-set token for `updateCustody`, and a call can run inside a caller's transaction with `{ tx }`. `KyselySecretService` now reports `durable = true`. `@pikku/core/testing` gains a `keyStore` entry in `defineServiceTests`, a conformance suite run against the memory, file and Kysely stores; `MemoryKeyStore.firstActivate` now refuses a kid that already exists instead of overwriting that row.
