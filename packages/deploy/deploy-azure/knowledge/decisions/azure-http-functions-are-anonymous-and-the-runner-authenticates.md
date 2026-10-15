---
type: decision
title: Azure HTTP functions are registered with anonymous auth, leaving authentication to the Pikku runner
description: The generated Azure entry sets authLevel anonymous on every HTTP route, so the platform does no auth before the Pikku function runner
tags: deploy, azure, auth, http
---

# Azure HTTP functions are registered with anonymous auth, leaving authentication to the Pikku runner

The Azure adapter in `packages/deploy/deploy-azure/src/adapter.ts` generates the
`app.http(...)` registrations. Every one of them is `authLevel: 'anonymous'`. For
each fetch route this is at `adapter.ts:93`. The RPC catch-all route under
`__pikku/<unit>/{*restOfPath}` is at `adapter.ts:130`. The WebSocket negotiate route
is at `adapter.ts:164`. The second generator repeats the same settings at
`adapter.ts:219` and `adapter.ts:246`.

The HTTP handler passes the request to core's `fetchData`
(`packages/runtimes/azure-functions/src/handler-factories.ts:92-94`), so the Pikku
function runner, not Azure's function-key or AAD gate, decides who may call a route.

**What this rules out:** relying on an Azure function key or AAD gate for these
routes. The generated registrations do not set one, and any change to the auth level
would need the runner's auth to stay in place as well.
