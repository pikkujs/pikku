---
type: decision
title: A host supplies platform services from one module
description: A deploy provider, or the --platform-services option locally, names a real module whose createPlatformServices runs last and may replace any service
tags: [deploy, dev, services]
---

# A host supplies platform services from one module

A host swaps a vendor by returning its own service from
`createPlatformServices(env, services, { requiredServices })`. The module is
named by `ProviderAdapter.platformServicesModule(ctx)` on deploy and by
`--platform-services` under `pikku dev` and `pikku serve`. On deploy the
generated platform-services file imports it, so every entry gets it the same
way; the two local commands load it themselves.

It is ordinary code: order and dependencies are written in the module, and
`requiredServices` says what to construct. A deploy unit whose provider names no
module gets no platform-services file, and a stale one is removed.

When the app has a column coercion map and the module returns a `kysely`, the
generated file attaches the coercion plugin to it, so every deploy target
returns the same Date, boolean and parsed JSON values `pikku dev` does. That is
the build's job, not each host's.

**What this rules out:** service construction emitted as strings by an adapter,
an addon-level version of this module (addon code never receives the host's
`env`), and a `pikku.config.json` key naming the module, since the host that
starts or deploys the app chooses it, not the project. An app may
replace a supplied service in `createSingletonServices`, with the existing
warning; there is no way to lock one.
