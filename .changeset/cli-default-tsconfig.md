---
'@pikku/cli': patch
---

A `pikku.config.json` without `tsconfig` uses `tsconfig.json` in the root, as `tsc` does, instead of crashing on an undefined path.
