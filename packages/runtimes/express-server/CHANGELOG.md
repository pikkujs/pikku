# @pikku/express

## 0.7.0

- Updating to match remaining packages

## 0.6.6

### Patch Changes

- d0968d2: fix: fixing content uploads for s3
- Updated dependencies [8658745]
- Updated dependencies [d0968d2]
  - @pikku/core@0.6.27

## 0.6.5

### Patch Changes

- 6da4870: moving body parser to middleware to avoid conflicts
- Updated dependencies [412f136]
  - @pikku/core@0.6.26

## 0.6.4

### Patch Changes

- b774c7d: fix: coerce top level data from schema now includes date strings
- Updated dependencies [b774c7d]
  - @pikku/express-middleware@0.6.7
  - @pikku/core@0.6.25

## 0.6.3

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/express-middleware@0.6.5
  - @pikku/core@0.6.22

## 0.6.2

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- c459ef5: fix: provide the express-middleware as part of server dependencies
- Updated dependencies [dee2e9f]
  - @pikku/core@0.6.1

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.9

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28
  - @pikku/express-middleware@0.5.12

## 0.5.8

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25
  - @pikku/express-middleware@0.5.10

## 0.5.7

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24
  - @pikku/express-middleware@0.5.9

## 0.5.6

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/express-middleware@0.5.6
  - @pikku/core@0.5.10

## 0.5.5

### Patch Changes

- 725723d: docs: adding typedocs
- Updated dependencies [3541ab7]
- Updated dependencies [725723d]
  - @pikku/core@0.5.9
  - @pikku/express-middleware@0.5.5

## 0.5.4

### Patch Changes

- 8d85f7e: feat: load all schemas on start optionally instead of validating they were loaded
- Updated dependencies [1876d7a]
- Updated dependencies [8d85f7e]
  - @pikku/core@0.5.8
  - @pikku/express-middleware@0.5.4

## 0.5.3

### Patch Changes

- 3b51762: refactor: not using initialize call to core
- Updated dependencies [3b51762]
  - @pikku/express-middleware@0.5.3

## 0.5.2

### Patch Changes

- 0e1f01c: refactor: removing cli config from servers entirely'

## 0.5.1

### Patch Changes

- 97900d2: fix: exporting plugins from default barrel files
- d939d46: refactor: extracting nextjs and fastify to plugins
- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1
  - @pikku/express-middleware@0.5.1
