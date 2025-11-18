## 0.11.0

### Minor Changes

- Workflow support

# @pikku/uws

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0
  - @pikku/uws-handler@0.9.3-next.0

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
  - @pikku/uws-handler@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1
  - @pikku/uws-handler@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.1

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/uws-handler@0.6.4
  - @pikku/core@0.6.7

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.9

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28
  - @pikku/uws-handler@0.5.13

## 0.5.8

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25
  - @pikku/uws-handler@0.5.10

## 0.5.7

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24
  - @pikku/uws-handler@0.5.9

## 0.5.6

### Patch Changes

- 11c50d4: feat: adding streams to cli
- Updated dependencies [cbcc75b]
- Updated dependencies [d58c440]
- Updated dependencies [11c50d4]
  - @pikku/core@0.5.19
  - @pikku/uws-handler@0.5.6

## 0.5.5

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/uws-handler@0.5.5
  - @pikku/core@0.5.10

## 0.5.4

### Patch Changes

- 725723d: docs: adding typedocs
- Updated dependencies [3541ab7]
- Updated dependencies [725723d]
  - @pikku/core@0.5.9
  - @pikku/uws-handler@0.5.4

## 0.5.3

### Patch Changes

- 4fb28f2: refactor: pulling uws handler into seperate package

## 0.5.2

### Patch Changes

- 0e1f01c: refactor: removing cli config from servers entirely'

## 0.5.1

### Patch Changes

- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1

## 0.4.8

### Patch Changes

- ddaf58f: feat: adding hostname to servers
- Updated dependencies [ddaf58f]
  - @pikku/core@0.4.7

## 0.4.7

### Patch Changes

- 75b9460: feat: adding health checks

## 0.4.6

### Patch Changes

- 2a2402b: republish since something went wrong
- Updated dependencies [2a2402b]
  - @pikku/core@0.4.6

## 0.4.5

### Patch Changes

- 1a708a7: refactor: renaming PikkuCLIConfig back to PikkuConfig
  feat: adding .end() to pikku response for servers that need it
- Updated dependencies [0650348]
- Updated dependencies [1a708a7]
- Updated dependencies [642d370]
  - @pikku/core@0.4.4

## 0.4.4

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages
- Updated dependencies [94f8a74]
  - @pikku/core@0.4.3

## 0.4.3

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them
- Updated dependencies [28f62ea]
- Updated dependencies [14783ee]
  - @pikku/core@0.4.2

## 0.4.2

### Patch Changes

- 5a012d9: Fixing typedoc generation
