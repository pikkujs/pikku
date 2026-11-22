---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/cloudflare': patch
'@pikku/deploy-standalone': patch
---

Declared analytics events now ship inside the bundle. The bootstrap imports `analytics/pikku-analytics-meta.gen.ts`, which registers the declared names in runtime state; read them with `getDeclaredAnalyticsEvents()` from `@pikku/core/analytics` instead of `metaService.getAnalyticsMeta()`, which returned `{}` on a Cloudflare Worker or standalone binary and so dropped every event. `analytics/pikku-analytics-meta.gen.json` now holds names only; the declaration details moved to `pikku-analytics-meta-verbose.gen.json`. A Cloudflare worker or standalone build with an analytics sink and no declared event refuses to start (`assertAnalyticsSinksDeclared`).
