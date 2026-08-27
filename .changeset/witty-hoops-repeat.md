---
'@pikku/kysely': patch
'@pikku/cli': patch
---

Encrypt classified columns from the generated manifest.

`ClassificationPlugin` reads the per-column classification manifest and decrypts `wrapped` and `sealed` columns transparently on the way out. Writes are not transparent — Kysely's `transformQuery` is synchronous and WebCrypto is not — so plaintext heading for a classified column **throws** instead, and values are produced by `ClassificationCrypto.encryptColumn()`. A forgotten call site is a loud error rather than a silent plaintext row. The stored envelope is self-describing (`pikku1.<keyId>.<version>.<wrappedDek>.<ciphertext>`), so a row records which key opens it without a schema change to every table.

`keyId` now flows from the hand-authored `db/annotations.ts` through `pikku db migrate` into `classification.gen.ts`. It is emitted only for `wrapped` and `sealed` columns: naming a key on a plain column would claim a protection it does not have, and a hashed column has no key at all — the hash is the lookup key.
