---
type: decision
title: Declared analytics events ship in the bundle, never read from disk
description: The bootstrap imports analytics/pikku-analytics-meta.gen.ts, which registers the declared names in pikkuState; getDeclaredAnalyticsEvents reads them there; a Cloudflare worker or standalone build with sinks and no declared events refuses to start
tags: core, analytics
---

# Declared analytics events ship in the bundle, never read from disk

A sink receives only the events its map names (fail closed). A platform that
registers one sink for every declared event builds that map from the declared
names, so where it reads them decides whether anything is delivered.

- The names come from `pikkuState(null, 'analytics', 'meta')`, registered by
  the generated `analytics/pikku-analytics-meta.gen.ts`, which the bootstrap
  imports like every other meta module. `getDeclaredAnalyticsEvents()` reads
  that slot and throws when it is `null` (the bootstrap was never imported).
- Rejected: reading them through `metaService.getAnalyticsMeta()`. It reads a
  JSON file from the output directory. No deploy runtime has that file or a
  `metaService`, so the map was `{}`, and with one sink registered the logger
  fallback in `fanOutAnalytics` is skipped: every event was dropped silently.
- The CLI writes the module before the deploy-codegen gate in `pikkuAnalytics`,
  because a deploy unit's bootstrap comes from a `PIKKU_DEPLOY_CODEGEN=1` pass.
  The bootstrap imports it unconditionally outside an addon, so a missing file
  fails the build, not the request.
- The runtime JSON holds `{ name }` per event. `file`, `variable` and `props`
  live in the `-verbose` sibling the console reads (`LocalMetaService` reads
  the verbose file first), so a bundle carries no build paths.
- `assertAnalyticsSinksDeclared(registry)` runs in the Cloudflare
  `setupServices` and the standalone entry once services are built: sinks with
  no declared event refuse to boot. It is not called by `pikku dev` or `serve`,
  where the local Kysely sink is registered even for a project that declares
  nothing.
