---
type: decision
title: Local trigger and gateway services assume a single process
description: InMemoryTriggerService and LocalGatewayService start every listener unconditionally with no distributed claiming, so a second instance duplicates every event
tags: services
---

# Local trigger and gateway services assume a single process

`InMemoryTriggerService` (`packages/core/src/services/in-memory-trigger-service.ts`)
and `LocalGatewayService` (`packages/core/src/services/local-gateway-service.ts`)
start every registered trigger source and every listener gateway
unconditionally. There is no claiming, no lease, no leader election: whoever
boots, listens.

That is correct for exactly one owner. Run two instances and both subscribe to
the same source, so every external event fires its RPC target twice — and because
triggers and listener gateways are typically wired to side-effecting functions,
the duplicate is not idempotent. A distributed deployment needs a different
`TriggerService` / `GatewayService` implementation that coordinates first; the
interfaces exist so that implementation can be dropped in.

**What this rules out:** scaling a `pikku serve` or container running these
services beyond one replica, and adding coordination inside these two classes.
They are the single-process implementations by definition — coordination belongs
in a sibling implementation, not behind a flag here.
