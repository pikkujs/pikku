---
'@pikku/core': patch
---

Restore the `SecretService.getSecret` JSDoc noting that it throws when the secret is absent. The line was on `main` and was removed by mistake in a comment cleanup on #1411 — the PR that changes what that throw says — leaving `getSecret` the only one of the interface's methods without its documented failure mode.
