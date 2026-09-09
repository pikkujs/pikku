---
'@pikku/core': minor
'@pikku/cli': minor
---

Product analytics moves into core behind a `scaffold.analytics` generator.

`@pikku/core/analytics` holds a sink registry — `setAnalyticsSink` plus
`recordAnalyticsEvents`, which counts events and forwards them to whatever sink
is registered, or to nothing at all when there is none. The CLI's new
`pikkuAnalytics` generator emits the `/analytics` ingest and its schemas from
the project's own `analytics-events.ts` event union, so the only analytics file
a project owns is the declaration of what it measures.

Identity is stamped server-side from the session and never read from the
request body. No middleware is emitted with the wire: an origin lock rejects
every native client and is forgeable anyway, so guarding the route is the
project's call.
