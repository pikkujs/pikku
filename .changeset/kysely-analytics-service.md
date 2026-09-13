---
'@pikku/kysely': patch
---

Add `KyselyAnalyticsService`, so declared events have somewhere to land.

Every other pikku primitive backed by a table had a Kysely implementation and
analytics did not, which meant a project that declared events either wired a
vendor sink or watched them go to the logger — and the logger is not somewhere
you can answer a question from. The new service appends to `pikkuAnalyticsEvents`,
gated by `ownedBy: ['analyticsService']` so only a project that declares events
carries the table.
