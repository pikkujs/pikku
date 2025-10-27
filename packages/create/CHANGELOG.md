# create-pikku

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.5

### Patch Changes

- 7e1f9a2: create: run pikku silently on start to reduce noise

## 0.9.4

### Patch Changes

- a5c2eff: feat: run sse and other tests on initial start to ensure setup correctly

## 0.9.3

### Patch Changes

- 6ff2f99: fix: stackblitz doesnt like hidden folders, so generate pikku in another

## 0.9.2

### Patch Changes

- fdb1593: feat: adding silent option to cli
- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- 22a1d7a: feat: adding remaining templates

## 0.9.1

### Patch Changes

- bb5803b: feat: adding stackblitz compatability

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updated for 0.8.0 compatibility with new project templates

## 0.0.12

### Patch Changes

- 378e46c: fix: invalid yarnlink check

## 0.0.11

### Patch Changes

- 2a000ea: fix: include the .pikku folder in the root directory in tsconfig to pickup schemas

## 0.0.10

### Patch Changes

- 412f136: updating local content service

## 0.0.9

### Patch Changes

- 60b2265: refactor: supporting request and response objects

## 0.0.8

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels

## 0.0.7

### Patch Changes

- d037fa1: fix: create dir for non templates
- de4a36b: refactor: renaming serverless templates to aws-lambda

## 0.0.6

### Patch Changes

- 49182d6: refactor: allowing nextjs-app to be created via create cli

## 0.0.5

### Patch Changes

- f8881ee: fix: run @pikku/cli correctly after create

## 0.0.4

### Patch Changes

- 615740e: fix: only ask for the version via the cli line

## 0.0.3

### Patch Changes

- dbbd304: feat: better support of yarn monorepo

## 0.0.2

### Patch Changes

- bdcc89a: feat: adding intro logo to cli based commands
- cb7bfdc: chore: remove ncu and tsc from packages

## 0.0.1

### Patch Changes

- 4a4a55d: fix: adding missing commander package
