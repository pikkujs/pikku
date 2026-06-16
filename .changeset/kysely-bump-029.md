---
'@pikku/kysely': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
'@pikku/cloudflare': patch
---

Bump the `kysely` dependency range to `^0.29.0` so it dedupes onto a single
copy alongside Better Auth (which bundles kysely 0.29.x), avoiding two
incompatible `Kysely` classes (the `#private` brand mismatch) when both pikku's
adapters and Better Auth share a database connection.

kysely 0.29 is ESM-only, which the unmaintained `kysely-plugin-serialize`
(no `exports` map, CommonJS build) cannot import. Its `SerializePlugin` is now
maintained directly in `@pikku/kysely` and re-exported, and the external
dependency is dropped from `@pikku/kysely`, `@pikku/kysely-sqlite`, and
`@pikku/cloudflare`.
