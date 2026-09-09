# @pikku/openapi-to-zod-schema

## 0.12.7

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

## 0.12.6

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

## 0.12.5

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.4

### Patch Changes

- 1419fba: Deprecated: This package has been merged into `@pikku/openapi-parser`. Please use `@pikku/openapi-parser` instead.

## 0.12.3

### Patch Changes

- a0c496f: Fix OpenAPI codegen bugs: use operation description instead of response description, sanitize dots in type names, quote hyphenated property keys, make function input optional in types, and use pikkuServices() in test template.
