---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

The app decides which of an addon's functions `rpc.exposed` reaches

`wireAddon` takes `expose?: boolean | string[]`, mirroring `mcp`. Unset or
`true` keeps the functions the addon declared `expose: true`; `false` exposes
none of the instance's functions; a list names exactly the functions to expose,
whether or not the addon declared them, typed against the addon's function
names. A listed name the addon does not publish fails the build with PKU343, a value that is not written inline fails it with
PKU344,
and the deploy analyzer's per-addon unit carries only what the wiring exposes.
