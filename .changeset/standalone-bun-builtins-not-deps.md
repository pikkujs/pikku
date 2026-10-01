---
'@pikku/cli': patch
---

A unit's generated `package.json` no longer lists `bun:sqlite`, `bun:ffi` or `bun` as dependencies, which made `bun install` fail on the standalone image now that the standalone runtime is bun-only.
