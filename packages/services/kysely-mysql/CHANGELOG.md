# @pikku/kysely-mysql

## 0.12.20

### Patch Changes

- 66f3dae: Move `@pikku/core` from `dependencies` to `peerDependencies` in the last packages that still declared it as a regular dependency.

  `@pikku/core` holds a single `pikkuState` registry and must resolve to exactly one copy at runtime — every wiring (workflows, RPCs, queue workers, middleware) registers into the copy it imports, and the runner reads the copy it imports. 35 packages already declare core as a peer for this reason; these six were the stragglers. Because they carried a regular `@pikku/core` dependency, bumping any one of them could leave a second, older core locked in a consumer's tree, splitting the registry so wirings silently fail to resolve (surfaced as `[PKU717] Multiple @pikku/core versions installed`).

  Making core a peer everywhere means the consuming app provides the one copy (the react/react-dom singleton pattern), so duplication is structurally impossible. `@pikku/core` is also kept as a devDependency in each package so it still builds/typechecks standalone.

  Backward-compatible for consumers that already list `@pikku/core` directly (every template does). A consumer that only pulled core transitively now gets a loud install-time peer warning instead of a silent runtime split — strictly better.

- Updated dependencies [ded4f90]
  - @pikku/core@0.12.54

## 0.12.19

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/core@0.12.44

## 0.12.18

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

## 0.12.17

### Patch Changes

- f90daa4: Replace workspace:_ protocol with explicit npm version ranges in all package.json files. Fixes broken publishes where workspace:_ was included literally in the npm registry.

## 0.12.16

### Patch Changes

- Updated dependencies [9e8605f]
- Updated dependencies [624097e]
- Updated dependencies [7ab3243]
  - @pikku/core@0.12.15
  - @pikku/kysely@0.12.9

## 0.12.15

### Patch Changes

- Updated dependencies [f85c234]
- Updated dependencies [88d3100]
  - @pikku/core@0.12.14
  - @pikku/kysely@0.12.8

## 0.12.14

### Patch Changes

- Updated dependencies [2ce0733]
  - @pikku/core@0.12.13

## 0.12.13

### Patch Changes

- Updated dependencies [84f01ad]
  - @pikku/core@0.12.12

## 0.12.12

### Patch Changes

- Updated dependencies [4e52200]
  - @pikku/core@0.12.11

## 0.12.11

### Patch Changes

- Updated dependencies [c485aab]
  - @pikku/kysely@0.12.7

## 0.12.10

### Patch Changes

- Updated dependencies [0f59432]
- Updated dependencies [52b64d1]
  - @pikku/core@0.12.10
  - @pikku/kysely@0.12.6

## 0.12.9

### Patch Changes

- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [87433f0]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9
  - @pikku/kysely@0.12.5

## 0.12.8

### Patch Changes

- Updated dependencies [09491c6]
  - @pikku/core@0.12.8

## 0.12.7

### Patch Changes

- Updated dependencies [66519c9]
  - @pikku/core@0.12.7

## 0.12.6

### Patch Changes

- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6
  - @pikku/kysely@0.12.4

## 0.12.5

### Patch Changes

- Updated dependencies [198e68f]
  - @pikku/core@0.12.5

## 0.12.4

### Patch Changes

- Updated dependencies [688b5e8]
  - @pikku/core@0.12.4

## 0.12.3

### Patch Changes

- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [387b2ee]
- Updated dependencies [b2b0af9]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3
  - @pikku/kysely@0.12.3
