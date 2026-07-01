# @pikku/kysely-bun-sqlite

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
