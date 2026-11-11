---
'@pikku/cli': patch
---

`pikku validate` no longer reports a missing `outDir` in pikku.config.json. The key was removed from the config, so the check told users to add one the loader rejects.
