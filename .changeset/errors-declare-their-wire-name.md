---
'@pikku/core': patch
'@pikku/cli': patch
---

A deployed error now answers with its real name instead of the bundler's identifier for it — `PermissionDeniedError`, not `cn`. Every built-in error declares its wire name as a string literal; `declareErrorNames` does the same for your own error classes. The Bun deploy bundler also keeps names now, matching the esbuild one.
