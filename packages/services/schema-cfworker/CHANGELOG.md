# @pikku/cfworker-json-schema

## 0.8.0

- Updating to match remaining packages

## 0.7.1

### Patch Changes

- 7fbaf32: fix: need to copy schema value since cf-worker tries to manipulate it
- Updated dependencies [cd83e0a]
  - @pikku/core@0.7.1

## 0.7.0

- Updating to match remaining packages

## 0.6.2

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.1

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.2

### Patch Changes

- e0dd19a: fix: invalid schemas should result in a 422
- Updated dependencies [e0dd19a]
  - @pikku/core@0.6.12

## 0.6.1

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7
