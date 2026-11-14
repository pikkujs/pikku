---
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/skills': patch
---

Better Auth's tables and the runtime's secret columns now carry built-in column annotations, so `pikku db migrate` brands them without a `db/tables.ts` entry: `user.email` is `pii` with `format: 'email'`, `session.token`, `account.access_token`, `refresh_token`, `id_token` and `verification.value` are `secret` with `form: 'plain'`, `account.password` is `secret` with `form: 'hashed'`, `session.ip_address` is `pii`, and the `secrets` and `credentials` ciphertext columns are `secret` with `form: 'plain'`. A project's own annotation on a column replaces the built-in one. See docs/MIGRATION.md for what apps see.
