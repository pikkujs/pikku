---
'@pikku/cli': patch
---

`pikku deploy plan` and `pikku deploy apply` now fail with a non-zero exit code when the build pipeline reports a failure, instead of continuing on to plan or deploy against a stale bundle.
