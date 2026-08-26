---
'@pikku/core': patch
---

Reading an optional secret that is not set no longer makes `hasSecret` report it as set. `TypedSecretService` caches `undefined` to remember the absence, and the cache probe read that as a value.
