# @pikku/tanstack-start

## 0.12.2

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/better-auth@0.12.13
  - @pikku/core@0.12.44

## 0.12.1

### Patch Changes

- c899301: Move Better Auth framework adapters into `@pikku/next` and the new `@pikku/tanstack-start` runtime package, while keeping generic auth-factory resolution in `@pikku/better-auth`.
- Updated dependencies [c899301]
  - @pikku/better-auth@0.12.8
