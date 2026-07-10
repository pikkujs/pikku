## 0.12.5

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.4

### Patch Changes

- 60ad8cb: fix dev-server hot reload so edited AND new functions/routes apply without a restart
  - `@pikku/core`: the hot reloader fed raw zod `input`/`output` schemas into the JSON-schema map, so `compileAllSchemas` threw `Failed to compile schema` on every reload and the reload aborted (only the function body sometimes swapped, half-updated). It now registers function implementations only and leaves schemas to the codegen JSON output. New function exports are registered too (previously only already-registered names were replaced). Reloads write into the startup functions map directly to avoid a race with the dev watcher's codegen-scoped state swap, and re-import via a uniquely-named sibling copy since neither Bun nor tsx bust the module cache on a `?t=` query.
  - New `reloadGeneratedMeta` (exported from `@pikku/core/dev`) re-reads the regenerated wiring meta + JSON schemas into the running process so new/changed routes, RPCs, queues and agents resolve without a restart.
  - `@pikku/cli`: `pikku dev` now calls `reloadGeneratedMeta` after each watch-triggered codegen pass and re-imports the changed files once fresh meta is in state, so a NEW route in a changed wiring file registers (its `wireHTTP` no longer no-ops on missing meta).
  - `@pikku/schema-cfworker`: `compileSchema` recompiles when a schema's value changes (not only on first sight), so hot-reloaded schemas take effect.

- Updated dependencies [60ad8cb]
- Updated dependencies [8f5c998]
  - @pikku/core@0.12.57

## 0.12.3

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.0

## 0.12.2

### Patch Changes

- e3142ad: Stop logging full user input on schema validation failure to prevent sensitive data leaking into logs.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
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

## 0.12.1

### Patch Changes

- e04531f: Code quality improvements: resolve oxlint warnings and apply autofixes across the codebase (unused bindings, unnecessary constructors, prefer `const` over `let`, etc.). No behaviour changes.
- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1

- Updated dependencies

## 0.11.0

### Minor Changes

- Workflow support

# @pikku/cfworker-json-schema

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.2

### Patch Changes

- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updating to match remaining packages

## 0.7.1

### Patch Changes

- 7fbaf32: fix: need to copy schema value since cf-worker tries to manipulate it
- Updated dependencies [cd83e0a]
  - @pikku/core@0.7.1

## 0.7.0

- Updating to match remaining packages

## 0.6.2

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.1

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- e0dd19a: fix: invalid schemas should result in a 422
- Updated dependencies [e0dd19a]
  - @pikku/core@0.6.12

## 0.6.1

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7
