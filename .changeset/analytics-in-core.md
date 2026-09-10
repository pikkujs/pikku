---
'@pikku/core': patch
'@pikku/cli': patch
---

Product analytics moves into core behind a `scaffold.analytics` generator.

`@pikku/core/analytics` holds a sink registry — `setAnalyticsSink` plus
`recordAnalyticsEvents`, which counts events and forwards them to whatever sink
is registered. `loggerAnalyticsSink` is the one an app gets before it has
chosen a store, so turning the scaffold on is enough to watch events arrive.
The CLI's new `pikkuAnalytics` generator emits the `/analytics` ingest and its
schemas from the project's own `analytics-events.ts` event union, so the only
analytics file a project owns is the declaration of what it measures.

The generated wire is added to the set of scaffolds the inspector reads.
Nothing imports it — it is a wiring, not a module anyone calls — so without
that the route was written and never registered: no HTTP wiring, no entry in
the fetch client, an endpoint that 404s.

Identity is stamped server-side from the session and never read from the
request body. No middleware is emitted with the wire: an origin lock rejects
every native client and is forgeable anyway, so guarding the route is the
project's call.
