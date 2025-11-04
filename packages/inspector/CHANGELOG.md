# @pikku/inspector

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [778267e]
  - @pikku/core@0.10.1

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.6-next.0

### Patch Changes

- feat: running @pikku/cli using pikku
- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.5

### Patch Changes

- 501c120: fix: rpc internal meta file wasn't being imported

## 0.9.4

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- Updated dependencies [6059c87]
- Updated dependencies [6db63bb]
- Updated dependencies [74f8634]
- Updated dependencies [766fef1]
  - @pikku/core@0.9.6

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size
- b3c2829: fix (using ai): generating custom types broke imports.. this fixes it, but needs more robust training
- Updated dependencies [9691aba]
- Updated dependencies [2ab0278]
- Updated dependencies [81005ba]
  - @pikku/core@0.9.3

## 0.9.2

### Patch Changes

- 6cf8efd: feat: Adding PikkuDocs to function definition

  refactor: renaming APIDocs to PikkuDocs

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

## 0.8.1

### Patch Changes

- 44e3ff4: feat: enhance CLI filtering with type and directory filters

  - Add --types filter to filter by PikkuEventTypes (http, channel, queue, scheduler, rpc, mcp)
  - Add --directories filter to filter by file paths/directories
  - All filters (tags, types, directories) now work together with AND logic
  - Add comprehensive logging interface to inspector package
  - Add comprehensive test suite for matchesFilters function
  - Support cross-platform path handling

- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:

  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- Updated dependencies [3261090]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1

## 0.8.0

### Major Features

- **Model Context Protocol (MCP) Analysis**: Added comprehensive MCP endpoint analysis
- **Queue Worker Analysis**: Added queue analysis
- **Enhanced Service Analysis**: Added service destructuring analysis for better code generation and type safety

## 0.7.7

### Patch Changes

- 8b4f52e: refactor: moving schemas in channels to functions
- Updated dependencies [8b4f52e]
- Updated dependencies [8b4f52e]
- Updated dependencies [1d70184]
  - @pikku/core@0.7.8

## 0.7.6

### Patch Changes

- faa1369: refactor: moving function imports into pikku-fun.gen file

## 0.7.5

### Patch Changes

- c5e724c: fix: rerelease as previous publish is missing something

## 0.7.4

### Patch Changes

- 598588f: fix: generating output schemas from function meta
- Updated dependencies [598588f]
  - @pikku/core@0.7.4

## 0.7.3

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)
- Updated dependencies [534fdef]
  - @pikku/core@0.7.3

## 0.7.2

### Patch Changes

- 7acd53a: fix: ignore return type if it's void
- Updated dependencies [bb59874]
  - @pikku/core@0.7.2

## 0.7.1

### Patch Changes

- ebfb786: fix: only inspect function calls with pikku\*func in name

## 0.7.0

This has changed significantly. The inspector now finds all functions and then links them to events.

This means we can now get:

- RPCs out of the box
- Schemas are per function, not event
- Supports inline functions, external functions, anonymous functions

## 0.6.4

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.3

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- a40a508: fix: Fixing some generation bugs and other minors
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.1

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references
- Updated dependencies [f26880f]
  - @pikku/core@0.6.4
