---
'@pikku/core': patch
'@pikku/better-auth': patch
---

Grant a provisioned persona its declared roles instead of only writing better-auth's `user.role`.

Operator sign-in named a single role and the fabric plugin wrote it onto the user row. An app that authorizes on scopes never reads that column, so a persona created on a deployed stage held nothing and the role check refused it as seed drift.

The persona's full role list now travels with `actAs`, and the plugin grants each declared one through the `ScopeService` when it creates the account.
