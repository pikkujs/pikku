# @pikku/mongodb

## 0.12.3

### Patch Changes

- a2ee6d0: Replace process.exit(1) with thrown error on MongoDB connection failure to allow graceful error handling.
- 87433f0: Validate state key names in updateRunState to prevent MongoDB operator injection.
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

## 0.12.2

### Patch Changes

- 3e79248: Add setStepChildRunId to workflow service implementations and auto-bootstrap in pikku all
- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.1

### Patch Changes

- 97bab28: Initial release of @pikku/mongodb — MongoDB-backed service implementations for Pikku, including SecretService, ChannelStore, EventHubStore, DeploymentService, WorkflowService, WorkflowRunService, AIStorageService, AIRunStateService, and AgentRunService.
- c7ff141: Add WorkflowVersionStatus type with draft→active lifecycle for AI-generated workflows, type all DB status fields with proper unions instead of plain strings
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3
