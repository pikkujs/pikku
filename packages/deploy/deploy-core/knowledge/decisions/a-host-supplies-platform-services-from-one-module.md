---
type: decision
title: A host supplies platform services from one module
description: A deploy provider, or devPlatformServices locally, names a real module whose createPlatformServices runs last and may replace any service
tags: [deploy, dev, services]
---

# A host supplies platform services from one module

A host swaps a vendor by returning its own service from
`createPlatformServices(env, services, { requiredServices })`. The module is
named by `ProviderAdapter.platformServicesModule(ctx)` on deploy and by
`devPlatformServices` under `pikku dev` and `pikku serve`. The generated
platform-services file imports it, so every entry gets it the same way.

It is ordinary code: order and dependencies are written in the module, and
`requiredServices` says what to construct.

**What this rules out:** service construction emitted as strings by an adapter,
an addon-level version of this module (addon code never receives the host's
`env`), and an app setting that wraps a deploy provider's module. An app may
replace a supplied service in `createSingletonServices`, with the existing
warning; there is no way to lock one.
