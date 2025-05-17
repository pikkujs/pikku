# @pikku/inspector

## 0.8.0

### Minor Changes

- 01fd252: upgrading pikku to 0.7 as part of APIFunction signature change

### Patch Changes

- Updated dependencies [01fd252]
- Updated dependencies [0f71559]
- Updated dependencies [14d29d0]
  - @pikku/core@0.8.0

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
