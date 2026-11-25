---
type: decision
title: Services are declared with defineProvider and a provider reports what its entry holds
description: A deploy provider describes its runtime through serviceSupport (baseline keys and whether the server lifecycle runs); one resolver in the CLI orders, checks and writes the services for every provider
tags: [deploy, provider, services, addons]
---

# Services are declared with defineProvider and a provider reports what its entry holds

A project declares a service with `defineProvider` and opts in to an addon's by
name with `wireAddon({ providers: ['name'] })`; an addon exports its services and
publishes their meta, and a host gets nothing it did not list. A provider
implements one optional method:

```ts
serviceSupport?(ctx: EntryGenerationContext): ServiceSupport
// ServiceSupport = { baseline: readonly string[]; runsServerLifecycle: boolean }
```

`baseline` is the keys the generated entry holds before any service runs. They
are handed to the generated runner as `runtime`, meet a service's needs, and may
be replaced by one service providing the same key. `runsServerLifecycle` is
required so a new provider has to decide: it is true where the entry runs the
server lifecycle (a server or container entry) and false for a Worker or Lambda
handler.

The CLI turns that and the project's services into one generated
`platform-services.gen.ts` per unit (see the CLI decision on the runner), so
every provider gets the same selection, ordering and errors.

**What this rules out:**

- Silent override. Two services providing one key is a build error naming both;
  only a baseline key may be replaced, by one service.
- Quietly building a different app. A service with no variant for the target is
  an error unless the target's baseline already holds every key it provides. A
  provider with no `serviceSupport` fails the build when the project declares a
  service that runs on deploy.
- Starting work a target would never run. A selected service with
  `onServerStart` is a build error where `runsServerLifecycle` is false.
- Build-time facts a service reads. A service reads its environment through the
  `env` it is given and the keys it destructures, so there is no platform
  object to keep in step between dev and deploy.
- Runtime SQL in a service. Schema comes from `pikku db generate`.

**Hook contract:** start hooks run before the app's `beforeStart` in dependency
order and a failure aborts startup, naming the service
(`composeServerLifecycle` in `@pikku/core/lifecycle`). Teardown is each
service's `stop()`, called by `stopSingletonServices`.

**Gotchas:** each `dev` and `deploy` variant given by reference must live in its
own module, or both are bundled; a service whose binding is missing at startup
throws.
