---
'@pikku/bun-server': patch
'@pikku/kysely-bun-sqlite': patch
'create-pikku': patch
'@pikku/cli': patch
---

Raise the supported Bun version to 1.4.

`@pikku/bun-server` and `@pikku/kysely-bun-sqlite` now declare `engines.bun: >=1.4.0`
and build against `@types/bun@^1.4.0`. `create-pikku` scaffolds
`"packageManager": "bun@1.4.0"`, and the fabric `smoke`/`validate` commands default to
and recommend the same version. CI pins `oven-sh/setup-bun` to 1.4.0 instead of
tracking `latest`.
