# @pikku/kysely-node-sqlite

## 1.0.0

### Patch Changes

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.13.0
  - @pikku/kysely@1.0.0
  - @pikku/kysely-sqlite@1.0.0

## 0.12.4

### Patch Changes

- 9d62571: Make user-defined SQL functions an explicit, checked capability of the SQLite drivers.

  `node:sqlite` can register scalar UDFs (`db.function()`); `bun:sqlite` cannot. Until now
  neither driver mentioned that, so an app that registered a UDF by reaching for the raw
  connection worked on Node and, on bun, failed as `no such function: …` from whichever
  query used it — typically one endpoint breaking in production while everything else
  looked healthy.

  Both drivers now export `registerSqliteFunctions(db, functions)` and accept a
  `functions` option on `createNodeSqliteKysely` / `createBunSqliteKysely`. The Node
  implementation registers them as deterministic; the bun implementation throws
  `SqliteFunctionsUnsupportedError` — exported from `@pikku/kysely-sqlite`, and naming
  every function requested — so the incompatibility surfaces at wiring time with a message
  saying what to do about it.

- Updated dependencies [32277d5]
- Updated dependencies [ea8aabf]
- Updated dependencies [33e96ab]
- Updated dependencies [fd72e58]
- Updated dependencies [cabd9dc]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [894b2f8]
- Updated dependencies [dd19aa7]
- Updated dependencies [50ec500]
- Updated dependencies [9d62571]
  - @pikku/core@0.12.75
  - @pikku/kysely@0.13.8
  - @pikku/kysely-sqlite@0.12.10

## 0.12.3

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/core@0.12.44
  - @pikku/kysely-sqlite@0.12.7

## 0.12.2

### Patch Changes

- 34f254e: Bump the `kysely` dependency range to `^0.29.0` so it dedupes onto a single
  copy alongside Better Auth (which bundles kysely 0.29.x), avoiding two
  incompatible `Kysely` classes (the `#private` brand mismatch) when both pikku's
  adapters and Better Auth share a database connection.

  kysely 0.29 is ESM-only, which the unmaintained `kysely-plugin-serialize`
  (no `exports` map, CommonJS build) cannot import. Its `SerializePlugin` is now
  maintained directly in `@pikku/kysely` and re-exported, and the external
  dependency is dropped from `@pikku/kysely`, `@pikku/kysely-sqlite`, and
  `@pikku/cloudflare`.

- Updated dependencies [6565b97]
- Updated dependencies [34f254e]
  - @pikku/kysely@0.12.16
  - @pikku/kysely-sqlite@0.12.6

## 0.12.1

### Patch Changes

- 9060165: New `@pikku/kysely-node-sqlite` provides a Kysely dialect and migrator for Node's built-in `node:sqlite`. `@pikku/kysely-sqlite` adds a `LibsqlWebDialect` for running Kysely against Cloudflare Workers and Turso databases over HTTP.
- Updated dependencies [9060165]
  - @pikku/kysely-sqlite@0.12.5
