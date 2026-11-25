---
'@pikku/addon-kysely': patch
'@pikku/addon-kysely-postgres': patch
'@pikku/addon-kysely-mysql': patch
'@pikku/addon-kysely-sqlite': patch
'@pikku/addon-kysely-bun-sqlite': patch
'@pikku/addon-kysely-node-sqlite': patch
'@pikku/addon-queue-nats': patch
'@pikku/cli': patch
---

The kysely packages move to `packages/addon/*` and are built as addons, renamed `@pikku/addon-kysely`, `@pikku/addon-kysely-postgres`, `@pikku/addon-kysely-mysql`, `@pikku/addon-kysely-sqlite`, `@pikku/addon-kysely-bun-sqlite` and `@pikku/addon-kysely-node-sqlite`. `@pikku/queue-nats` is `@pikku/addon-queue-nats`, and its provider has `deploy:standalone` and `deploy:server` variants in place of `deploy`. Each engine package exports a `kysely` `defineProvider` with `dev` and `deploy:cloudflare-*` variants and no `deploy:standalone` variant. See docs/MIGRATION.md.
