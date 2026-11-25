---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/deploy-standalone': patch
'@pikku/deploy-cloudflare': patch
'@pikku/cloudflare': patch
---

`defineProviderCollection` and `defineProvider({ addTo })`: a collection is a list providers add one item to, read by a key of its name as label-sorted `{ label, item }` entries, with an item's `stop()` called in reverse resolved order. `analyticsSinks` is now a core collection of `{ sink, map }` items; `AnalyticsSinkRegistry` and `createAnalyticsSinks` are removed and hosts no longer create the registry. See docs/MIGRATION.md.
