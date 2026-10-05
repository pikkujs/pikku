---
'@pikku/addon-console': patch
---

The console no longer bundles the TypeScript compiler into serverless deploys: the diagnostics service loads on demand and is unavailable where it is not shipped.
