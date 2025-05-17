# @pikku/next

## 0.7.0

- Updating to match remaining packages


## 0.6.9

### Patch Changes

- 531f4b5: refactor: using userSession.set to set cookies with middleware
- Updated dependencies [531f4b5]
  - @pikku/core@0.6.24

## 0.6.8

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/core@0.6.22

## 0.6.7

### Patch Changes

- 57f5d8c: refactor: moving getSession out of nextjs wrapper since it bundles all routes and only needs middleware

## 0.6.6

### Patch Changes

- 1c7dfb6: fix: fixing some import issues
- Updated dependencies [1c7dfb6]
  - @pikku/core@0.6.15

## 0.6.5

### Patch Changes

- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/core@0.6.14

## 0.6.4

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6.3

### Patch Changes

- 2bc64fd: feat: adding methods to fetch wrapper (and small fixes)
- Updated dependencies [a40a508]
  - @pikku/core@0.6.5

## 0.6.2

### Patch Changes

- adecb52: feat: changes required to get cloudflare functions to work
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3

## 0.6.1

### Patch Changes

- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches
- Updated dependencies [ed45ca9]
- Updated dependencies [adeb392]
  - @pikku/core@0.6.2

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.12

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.11

### Patch Changes

- 5d03fac: refactor: removing some dead code

## 0.5.10

### Patch Changes

- ab42f18: chore: upgrading to next15 and dropping pages support
- Updated dependencies [ab42f18]
  - @pikku/core@0.5.26

## 0.5.9

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.8

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24

## 0.5.7

### Patch Changes

- 5be6da1: feat: adding streams to uws (and associated refactors)
- Updated dependencies [5be6da1]
  - @pikku/core@0.5.20

## 0.5.6

### Patch Changes

- d58c440: refactor: making http requests explicit to support other types
- 11c50d4: feat: adding streams to cli
- Updated dependencies [cbcc75b]
- Updated dependencies [d58c440]
- Updated dependencies [11c50d4]
  - @pikku/core@0.5.19

## 0.5.5

### Patch Changes

- 69d388d: refactor: switching to use config async creator

## 0.5.4

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/core@0.5.10

## 0.5.3

### Patch Changes

- 725723d: docs: adding typedocs
- Updated dependencies [3541ab7]
- Updated dependencies [725723d]
  - @pikku/core@0.5.9

## 0.5.2

### Patch Changes

- e470e65: fix: make middleware and plugin more generic to avoid typescript errors

## 0.5.1

### Patch Changes

- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1

## 0.4.5

### Patch Changes

- a7f7cd7: fix: using esm style imports for nextjs

## 0.4.4

### Patch Changes

- 2a2402b: republish since something went wrong
- Updated dependencies [2a2402b]
  - @pikku/core@0.4.6

## 0.4.3

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages
- Updated dependencies [94f8a74]
  - @pikku/core@0.4.3

## 0.4.2

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them
- Updated dependencies [28f62ea]
- Updated dependencies [14783ee]
  - @pikku/core@0.4.2
