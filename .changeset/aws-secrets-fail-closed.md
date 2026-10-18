---
'@pikku/aws-services': patch
'@pikku/core': patch
---

`AWSSecrets.hasSecret` returns `false` only when Secrets Manager reports `ResourceNotFoundException` (or the secret holds no string value). Any other failure, such as throttling, expired credentials or a network error, is now thrown. Before this, an outage looked like "secret not configured", so `@pikku/core`'s remote calls went out without authentication instead of failing closed.

`AWSSecrets.getSecrets` follows the same rule: it leaves out keys that don't exist and throws on a backend failure. Before this, every key that failed was silently dropped.

The `SecretService.hasSecret` contract in `@pikku/core` now says what it always has to for callers that fail closed: it resolves `false` for a key that is absent or not allowed, and throws on a backend failure. It used to say it "must not throw". The other backends (Kysely, MongoDB, Redis, Vault, local) already behaved this way; AWS was the one that swallowed errors.
