## 0.12.0

## 0.12.8

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks

  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

- Updated dependencies [f85c234]
- Updated dependencies [88d3100]
  - @pikku/core@0.12.14

## 0.12.7

### Patch Changes

- c485aab: Fix CamelCasePlugin mismatch: convert all table types, query references, and result property accesses from snake_case to camelCase to match Kysely CamelCasePlugin runtime behavior

## 0.12.6

### Patch Changes

- 0f59432: Add per-user credential system with CredentialService, OAuth2 route handlers, and KyselyCredentialService with envelope encryption
- Updated dependencies [0f59432]
- Updated dependencies [52b64d1]
  - @pikku/core@0.12.10

## 0.12.5

### Patch Changes

- 87433f0: Remove secret key names from error messages to prevent information disclosure.
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

## 0.12.4

### Patch Changes

- 3e79248: Add setStepChildRunId to workflow service implementations and auto-bootstrap in pikku all
- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.3

### Patch Changes

- 32ed003: Add envelope encryption utilities and database-backed secret services with KEK rotation support
- 387b2ee: Add error_message column to agent run storage and queries
- b2b0af9: Migrate all consumers from @pikku/pg to @pikku/kysely and remove the @pikku/pg package
- c7ff141: Add WorkflowVersionStatus type with draft→active lifecycle for AI-generated workflows, type all DB status fields with proper unions instead of plain strings
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- ce961b5: fix: improve MySQL compatibility in AI storage service by using varchar columns with explicit lengths instead of text for primary keys, foreign keys, and indexed columns, and handle duplicate index errors gracefully
- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

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

- Remove Kysely-based channel and eventhub stores (use @pikku/pg instead)
- Update to support shared connection instances

# @pikku/kysely

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.5-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.4

### Patch Changes

- 58fe540: fix: kysely pure script should also clean arrays
- Updated dependencies [85a1c76]
  - @pikku/core@0.9.7

## 0.9.3

### Patch Changes

- 917bd6b: feat: fixing number issue with pure generation
- af95a59: fix: adding a number type (string or number) to db for now. Going forward should probably parse to a number but js and floats..
- Updated dependencies [9691aba]
- Updated dependencies [2ab0278]
- Updated dependencies [81005ba]
  - @pikku/core@0.9.3

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

- Updated to match the 0.8 version

## 0.7.0

- Updating to match remaining packages

## 0.6.5

### Patch Changes

- 9541f42: fix: deleting ssl invalidation

## 0.6.4

### Patch Changes

- 8a14f3a: refactor: removing user session from channel object
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.3

### Patch Changes

- 2c9a6b0: fix: correct reference to pikku-kysely-pure

## 0.6.2

### Patch Changes

- 990c2c2: fix: not requiring kysely as a peerDependency

## 0.6.1

### Patch Changes

- 8fcaa7e: feat: adding kysely wrapper
- Updated dependencies [eb8a8b4]
  - @pikku/core@0.6.13

## 0.6.1

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.3

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.2

### Patch Changes

- 0f96787: refactor: dropping cjs support
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.1

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24
