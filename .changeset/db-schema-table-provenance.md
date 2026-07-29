---
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

`db/pikku-db-schema.gen.json` now records who declared each table. Every entry carries a `source` — `app`, `better-auth`, `pikku-runtime`, or an addon's package name — and framework-declared tables also carry the `origin` prose from their migration header.

The console's Database view filters on that instead of guessing from a table-name prefix. The old guess (`workflow_`, `ai_`, `pikku_`) missed Better Auth's `user`, `session`, `account` and `verification`, the secrets, credentials, channel and webhook-delivery tables, and every addon's, all of which rendered as if the project owned them. A schema JSON generated before this change still falls back to the prefix guess, so an un-regenerated project sees no behaviour change.

Provenance is read back out of the generated migrations at codegen time — each one already names its source in its filename and its origin in its header — so `db migrate` needs no new inputs and does not have to load the project's Better Auth config.
