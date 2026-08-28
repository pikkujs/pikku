---
'@pikku/cli': patch
---

The Bun deploy bundler now keeps names, matching the esbuild one, so a deployed error answers with its real name instead of the bundler's identifier for it — `PermissionDeniedError`, not `cn`. An error's `name` is its constructor's name, so a bundler you configure yourself has to preserve names too.
