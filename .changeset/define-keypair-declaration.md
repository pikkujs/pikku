---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
---

`defineKeyPair` declares an asymmetric key pair by name (algorithm, purpose, rotation period, verify grace, scope) from `@pikku/core/keypair`, `#pikku/keypairs` in an app. Both inspector engines record it in `state.keyPairs`; the CLI validates it (allow-list ed25519, x25519, rs256; verify grace of at least one hour and at least the signed lifetime plus cache and skew; rotation at least twice the grace) and writes `pikku-keypairs-meta.gen.json` and a `KeyPairsMap`, so `keys.sign` takes only signing names and `keys.open` only sealing names. Declarations hold no key material. `SecretService` gains an optional `durable` flag that the typed and scoped wrappers forward. `defineSecret` now accepts `rotationPeriod: 'never'` in both inspectors and its `generate: { size }` option reaches the state, which both inspectors previously dropped.
