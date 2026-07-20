---
'@pikku/cli': patch
---

Pin the bootstrap `@pikku/inspector` alongside `@pikku/cli`. Only the CLI was
pinned, so when the inspector dropped `state.http.routePermissions` the pinned
older CLI still read `routePermissions.size` and every bootstrap build failed.
