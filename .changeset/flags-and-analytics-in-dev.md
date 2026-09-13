---
'@pikku/cli': patch
'@pikku/inspector': patch
---

Give `pikku dev` and `pikku serve` a database-backed flag store and analytics sink.

Both followed `agentStorage` and friends everywhere except in being wired: with a
local database present, `dev` built one for agents, workflows and scopes and left
feature flags unregistered — which makes every gate resolve open — and analytics
on the logger fallback. Both are now built from the same `kysely`, and dropped
with a warning naming `pikku db generate` rather than failing the boot when the
tables are not there yet.

The inspector now counts a `featureFlag:` declaration as needing `featureFlags`
and a `defineAnalyticsEvents` declaration as needing `analyticsService`, the same
way a declared scope implies `scopeService`. Neither service is ever destructured
— the runner reaches both out of the singleton services — so without this the
declaration was invisible to service aggregation and `pikku db generate` wrote no
tables for either.
