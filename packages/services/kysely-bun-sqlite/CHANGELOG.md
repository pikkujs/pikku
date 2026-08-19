# @pikku/kysely-bun-sqlite

## 0.12.7

### Patch Changes

- 746ed6a: fix: one coercion plugin, not three

  The Kysely coercion plugin existed in three copies — the CLI's local database,
  `@pikku/kysely-node-sqlite` and `@pikku/kysely-bun-sqlite` — and all three had
  drifted apart. Only the CLI's resolved a column against the tables the query
  actually named, so two tables that disagree on the kind of a same-named column
  coerced correctly in local development and silently did not at runtime; only
  bun's dropped a genuinely ambiguous column instead of letting the last table
  processed win.

  The single implementation now lives in `@pikku/kysely`, which all three already
  depended on, and keeps both behaviours: table-qualified resolution first, an
  ambiguity-safe bare-name fallback second.

  `ColumnKind` — the value type of the generated `coercion.gen.ts` — is
  `'date' | 'bool' | 'json'`. The CLI's fourth member, `uuid`, was never a
  coercion kind: the codegen excludes it from the map by construction, because a
  UUID is a string in both Postgres and SQLite. It is now `AnnotationKind` in the
  CLI, the union a column may declare in `db/annotations.ts`, of which
  `ColumnKind` is the coercible subset.

  `@pikku/cli` also drops its unused dependency on the Node-only
  `@pikku/kysely-node-sqlite`.

- Updated dependencies [5a1a962]
- Updated dependencies [746ed6a]
  - @pikku/core@0.12.86
  - @pikku/kysely@0.13.18

## 0.12.6

### Patch Changes

- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [3561d67]
- Updated dependencies [a91c433]
- Updated dependencies [02a70cd]
- Updated dependencies [9537f74]
- Updated dependencies [2b57ca8]
- Updated dependencies [266e3bc]
- Updated dependencies [9fce0f1]
- Updated dependencies [83683a0]
- Updated dependencies [456c88b]
- Updated dependencies [456c88b]
- Updated dependencies [c127273]
  - @pikku/core@0.12.85
  - @pikku/kysely@0.13.17
  - @pikku/kysely-sqlite@0.12.13

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
