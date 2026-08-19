# @pikku/kysely-node-sqlite

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

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82
  - @pikku/kysely@0.13.15
  - @pikku/kysely-sqlite@0.12.11

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
