---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
---

Product analytics moves into core behind a `scaffold.analytics` generator.

An app declares what it measures, and nothing else:

```ts
import { defineAnalyticsEvents } from '#pikku/analytics'

export const analyticsEvents = defineAnalyticsEvents({
  page_viewed: z.object({ path: z.string() }),
  todo_created: z.object({ priority: z.enum(['low', 'medium', 'high']) }),
})
```

The definer reaches an app through the generated `#pikku/analytics` leaf, the
way `defineFeatureFlags` reaches it through `#pikku/scopes` — an app declares
what it measures without importing out of core. The leaf is written on every
run, whatever `scaffold.analytics` says: the declaration is how a project names
what it measures, and the scaffold only decides whether an ingest wire is
generated for it. Its path is `analyticsTypesFile`, defaulting to
`<outDir>/analytics/pikku-analytics-types.gen.ts`.

The name is the key, so it is never repeated as a `z.literal` inside the
schema. Declare in as many modules as suits the project — a feature declares
its events beside its functions — and the CLI unions them into the generated
`/analytics` ingest and its schemas. The inspector finds the declarations the
way it finds every other wiring, so there is no path to configure.

Where events go is not part of the declaration. `services.analytics` is the
request-scoped buffer a function records into, typed against the declared
names:

```ts
await analytics.record({ name: 'todo_created', priority: 'high' })
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

`name` belongs to the event, not to its props. The generated union rebuilds
each member from the declared schema's shape and attaches the literal name
last, so a declaration that happens to carry a `name` prop of its own cannot
displace the discriminator the union is built on. Props schemas are typed to
require that shape, so a schema that has none — a union, a primitive — is
refused at the declaration rather than in generated code.
