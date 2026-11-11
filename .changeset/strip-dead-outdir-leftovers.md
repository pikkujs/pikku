---
'@pikku/cli': patch
---

`pikku validate`'s mocks check no longer reads `outDir` from `pikku.config.json`, which the loader refuses; it checks `.pikku/` beside the config. The config type comments and CLI knowledge docs now describe the fixed `.pikku/` output directory.
