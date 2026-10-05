---
'@pikku/core': minor
---

`SecretService` gains an optional `setEncryptedSecret(key, sealed)` for stores that hold a sealing key, so a browser can seal a secret and the caller's process never sees the plaintext.
