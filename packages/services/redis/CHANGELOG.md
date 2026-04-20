## 0.12.0

## 0.12.5

### Patch Changes

- 311c0c4: Unify session persistence through SessionStore, remove session blob from ChannelStore

  - PikkuSessionService now persists sessions via SessionStore on set()/clear() instead of every function call
  - ChannelStore no longer stores session data — maps channelId to pikkuUserId only
  - ChannelStore API: setUserSession/getChannelAndSession replaced with setPikkuUserId/getChannel
  - Serverless channel runner resolves sessions from SessionStore using pikkuUserId from ChannelStore

- Updated dependencies [311c0c4]
  - @pikku/core@0.12.18

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
