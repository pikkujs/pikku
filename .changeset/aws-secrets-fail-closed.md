---
'@pikku/aws-services': patch
---

`AWSSecrets.hasSecret` returns `false` only when Secrets Manager reports `ResourceNotFoundException` (or the secret holds no string value). Any other failure, such as throttling, expired credentials or a network error, is now thrown. Before this, an outage looked like "secret not configured", so `@pikku/core`'s remote calls went out without authentication instead of failing closed.

`AWSSecrets.getSecrets` follows the same rule: it leaves out keys that don't exist and throws on a backend failure. Before this, every key that failed was silently dropped.
