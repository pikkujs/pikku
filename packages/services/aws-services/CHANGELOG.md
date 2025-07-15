## 0.8.0

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.4

### Patch Changes

- 8658745: refactor: changing content service to use streams for performance benefits
- d0968d2: fix: fixing content uploads for s3
- Updated dependencies [8658745]
- Updated dependencies [d0968d2]
  - @pikku/core@0.6.27

## 0.6.3

### Patch Changes

- b19aa86: refactor: switching aws to using @aws-sdk/cloudfront-signer
- Updated dependencies [b19aa86]
  - @pikku/core@0.6.8

## 0.6.2

### Patch Changes

- 0a92fa7: refactor: pulling schema into seperate package since ajv doesnt work on cloudflare (also keeps bundle size small!)
- 780d7c2: revert: using import for json
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6.1

### Patch Changes

- ecc3660: fix: exporting files in index.ts for aws-services
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3

Marking a major release to include channels and scheduled tasks

## 0.5.5

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.4

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.3

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24

## 0.5.2

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/core@0.5.10

## 0.5.1

### Patch Changes

- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1

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

## 0.0.8 - 26.06.2022

chore: Upgrading dependencies

## 0.0.7 - 13.04.2022

chore: Upgrading dependencies

## 0.0.6 - 12.04.2022

chore: Upgrading dependencies

## 0.0.4 - 19.02.2022

chore: Upgrading dependencies

## 0.0.3 - 26.10.2021

feat: Adding writeFile, readFile and deleteFile API (beta)

## 0.0.2 - 02.10.2021

revert: Updating dependencies

AWS latest release bumps dependencies up to 200mb

## 0.0.1 - 02.09.2021

chore: Updating dependencies

## 23.07.2021

### Initial Release

A collection of useful AWS services
