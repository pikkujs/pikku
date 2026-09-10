---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

Product analytics moves into core behind a `scaffold.analytics` generator.

An app declares what it measures, and nothing else:

```ts
export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({ path: z.string() }),
  todo_created: z.object({ priority: z.enum(['low', 'medium', 'high']) }),
})
```

The name is the key, so it is never repeated as a `z.literal` inside the
schema. Declare in as many modules as suits the project — a feature declares
its events beside its functions — and the CLI unions them into the generated
`/analytics` ingest and its schemas. The inspector finds the declarations the
way it finds every other wiring, so there is no path to configure.

Where events go is not part of the declaration. `services.analyticsLog` is the
request-scoped buffer a function records into, typed against the declared
names:

```ts
await analyticsLog.record({ name: 'todo_created', priority: 'high' })
```

It stamps identity, trace and wire fields from the invocation, buffers for the
length of the call and flushes once when it ends. Identity is always
server-side and never read from a request body, which is what makes the
unauthenticated ingest safe to expose.

The transport behind it is an `AnalyticsService` on singleton services — the
one swappable slot. With none wired the runner installs
`LoggerAnalyticsService`, so an app that turns the scaffold on can watch events
arrive without first choosing a store; a platform injects its own through
singleton services, and an app that wants neither sets `analyticsService` in
its own `services.ts`, which runs last and wins. There is no process-global
sink registry and no noop: events are never silently dropped.

The generated wire is added to the set of scaffolds the inspector reads.
Nothing imports it — it is a wiring, not a module anyone calls — so without
that the route was written and never registered: no HTTP wiring, no entry in
the fetch client, an endpoint that 404s.

No middleware is emitted with the wire: an origin lock rejects every native
client and is forgeable anyway, so guarding the route is the project's call.
