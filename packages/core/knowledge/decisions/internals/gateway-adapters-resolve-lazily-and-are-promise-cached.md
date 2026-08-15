---
type: decision
title: Gateway adapters resolve lazily and are promise-cached
description: wireGateway accepts an adapter factory because real adapters need boot-time secrets, which forces the webhook GET route to be registered unconditionally
tags: gateway
---

# Gateway adapters resolve lazily and are promise-cached

`wireGateway` runs at module load, before secrets and services exist. Real
platform adapters (WhatsApp Cloud API, Slack, …) need both, so
`CoreGateway.adapter` accepts a `GatewayAdapterFactory` as well as an instance.
`resolveGatewayAdapter` in
`packages/core/src/wirings/gateway/gateway-runner.ts` invokes the factory on the
first inbound request (webhook/websocket) or on gateway start (listener). The
`resolvedAdapters` WeakMap caches the _promise_, not the resolved adapter, so
concurrent first requests share one construction instead of racing to build two
adapters — which for a stateful adapter would mean two platform connections.

The lazy resolution has one visible consequence in `wireWebhookGateway`: a
factory cannot be probed for `verifyWebhook` at wiring time, because it has not
run yet. The GET verification route is therefore registered unconditionally
whenever the adapter is a function, and only conditionally
(`adapter.verifyWebhook`) when it is a concrete instance. The GET handler throws
`NotFoundError` at request time if the resolved adapter turns out not to support
verification.

**What this rules out:** calling the factory eagerly inside `wireGateway` to
"simplify" route registration, caching the resolved adapter instead of the
promise, and narrowing the GET route registration to `adapter.verifyWebhook` for
all adapters — the last silently drops webhook verification for every
factory-based gateway.
