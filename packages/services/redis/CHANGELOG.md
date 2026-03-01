## 0.12.0

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

### New Features

- `RedisDeploymentService` for Redis-based service discovery with TTL heartbeats

## 0.11.2

### Features

- f35e89da: Add workflow graph support to RedisWorkflowService
  - Add `inline` field to workflow runs
  - Add `getCompletedGraphState` method for graph execution
  - Add `setBranchTaken` method for graph branching

## 0.11.2

### Patch Changes

- db9c7bf: Add workflow graph support to RedisWorkflowService
- Updated dependencies [db9c7bf]
  - @pikku/core@0.11.2

## 0.11.2

### Features

- f35e89da: Add workflow graph support to RedisWorkflowService
  - Add `inline` field to workflow runs
  - Add `getCompletedGraphState` method for graph execution
  - Add `setBranchTaken` method for graph branching

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Initial release with Redis-backed channel, eventhub, and workflow stores

# @pikku-workflows/redis

## 0.10.0

### Major Changes

- Initial release of @pikku-workflows/redis
- Redis-based WorkflowStateService implementation
- Distributed locking with Redis SET NX
- Support for shared or owned Redis connections
- Configurable key prefixes
