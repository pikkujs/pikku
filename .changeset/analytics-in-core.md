---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

Product analytics moves into core behind a `scaffold.analytics` generator.

`@pikku/core/analytics` holds a sink registry — `setAnalyticsSink` plus
`recordAnalyticsEvents`, which counts events and forwards them to whatever sink
is registered. `loggerAnalyticsSink` is the one an app gets before it has
chosen a store, so turning the scaffold on is enough to watch events arrive.

An app declares what it measures — and where the events go — in one place:

```ts
export const analytics = pikkuAnalytics({
  events: z.discriminatedUnion('name', [ ... ]),
  sink: loggerAnalyticsSink,
})
```

The inspector finds that declaration the way it finds every other wiring, so
there is no path to configure and no sink to register by hand; the CLI
generates the `/analytics` ingest and its schemas from it.

The generated wire is added to the set of scaffolds the inspector reads.
Nothing imports it — it is a wiring, not a module anyone calls — so without
that the route was written and never registered: no HTTP wiring, no entry in
the fetch client, an endpoint that 404s.

Identity is stamped server-side from the session and never read from the
request body. No middleware is emitted with the wire: an origin lock rejects
every native client and is forgeable anyway, so guarding the route is the
project's call.
