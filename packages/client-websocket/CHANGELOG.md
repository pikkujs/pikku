# @pikku/websocket

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.0

- Updating to match remaining packages

## 0.7.0

- Updating to match remaining packages

## 0.6.2

### Patch Changes

- 3062086: fix: renaming AbstractFetch/Websocket to core

## 0.6.1

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.4

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides

## 0.5.3

### Patch Changes

- aa8435c: fix: fixing up channel apis and implementations

## 0.5.2

### Patch Changes

- 0f96787: refactor: dropping cjs support
- c23524a: refactor: bump to versions to ensure correct package usage

## 0.5.1

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
