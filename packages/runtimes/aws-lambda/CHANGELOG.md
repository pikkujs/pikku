## 0.8.0

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

### Major Features

- **SQS Queue Support**: Added SQS queue worker support

## 0.7.0

- Updating to match remaining packages

## 0.6.8

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.7

### Patch Changes

- a234e33: fix: regressions in channels due to user session changes

## 0.6.6

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.5

### Patch Changes

- de4a36b: refactor: renaming serverless templates to aws-lambda

## 0.6.4

### Patch Changes

- 269a532: fix: fixing some typing issues
- Updated dependencies [7859b28]
- Updated dependencies [269a532]
  - @pikku/core@0.6.11

## 0.6.3

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6.2

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- adecb52: feat: changes required to get cloudflare functions to work
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3

### Patch Changes

- ed45ca9: feat: adding lambda serverless
- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches
- Updated dependencies [ed45ca9]
- Updated dependencies [adeb392]
  - @pikku/core@0.6.2

## 0.0.2 - 28.07.2021

Using peer dependencies to avoid version mismatches, which in turn affects lambda and singletons

## 0.0.1 - 27.07.2021

Chore: Bumping deps

## 23.07.2021

### Initial Release

A package that allows users to call Pikku functions from lambda
