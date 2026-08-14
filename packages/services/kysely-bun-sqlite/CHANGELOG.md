# @pikku/kysely-bun-sqlite

## 0.12.5

### Patch Changes

- 0686513: Declare `@pikku/core` as a peer dependency, matching `@pikku/kysely-sqlite`.

  The package depends on `@pikku/kysely-sqlite`, which requires `@pikku/core` as a
  peer, but never declared that requirement itself — so an install resolved
  without complaint and the missing peer only surfaced at runtime. It is now
  declared the same way its sibling declares it.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
- Updated dependencies [a7fcd2e]
  - @pikku/core@0.12.84
  - @pikku/kysely@0.13.16
  - @pikku/kysely-sqlite@0.12.12

## 0.12.4

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [fd9d834]
  - @pikku/kysely@0.13.15
  - @pikku/kysely-sqlite@0.12.11

## 0.12.3

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

- Updated dependencies [cabd9dc]
- Updated dependencies [9d62571]
  - @pikku/kysely@0.13.8
  - @pikku/kysely-sqlite@0.12.10

## 0.12.2

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/kysely-sqlite@0.12.7

## 0.12.1

### Patch Changes

- d5c3c85: feat: bun first-class support — new `@pikku/bun-server` runtime and `@pikku/kysely-bun-sqlite` dialect, bun template, CI matrix with `package-manager: [yarn, bun]`, and bun verifier.
- Updated dependencies [92cd5b1]
  - @pikku/kysely@0.12.17
