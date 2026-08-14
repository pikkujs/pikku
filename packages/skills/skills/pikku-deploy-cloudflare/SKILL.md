---
name: pikku-deploy-cloudflare
description: >-
  Use when deploying a Pikku app to Cloudflare Workers. Covers HTTP fetch handler, scheduled
  tasks, and WebSocket via Durable Objects. TRIGGER when: code imports @pikku/cloudflare, user
  mentions Cloudflare Workers deployment, or worker entry uses ExportedHandler/wrangler.toml. DO
  NOT TRIGGER when: just defining functions/wirings without Cloudflare-specific code.
installGroups: [fabric]
---

# Pikku Cloudflare Workers Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

```bash
yarn add @pikku/cloudflare
```

## Worker Entry

`@pikku/cloudflare` ships the handler factories the deploy codegen emits — use
them rather than hand-rolling an `ExportedHandler`. Each returns a
`WorkerEntrypoint` class that sets services up on every invocation (cached after
the first) and adds an RPC-callable `runRpc(name, args)`:

```typescript
import { createCloudflareHandler } from '@pikku/cloudflare'
import { createConfig, createSingletonServices } from './services.js'
import './.pikku/pikku-bootstrap.gen.js'

export default createCloudflareHandler(
  { createConfig, createSingletonServices },
  ['fetch', 'scheduled']
)
```

| Factory                                            | For                                              |
| -------------------------------------------------- | ------------------------------------------------ |
| `createCloudflareHandler(factories, handlerTypes)` | combined `fetch`/`queue`/`scheduled`             |
| `createCloudflareWorkerHandler(factories)`         | HTTP / agent / RPC / workflow-orchestrator units |
| `createCloudflareCronHandler(factories)`           | cron units                                       |
| `createCloudflareQueueHandler(factories)`          | queue-consumer and workflow-step units           |
| `createCloudflareMCPHandler(factories)`            | MCP units (same HTTP transport)                  |
| `createCloudflareWebSocketHandler(factories)`      | channel units, delegating to the DO              |

`factories` is `{ createConfig, createSingletonServices, createPlatformServices? }`.

## Service Setup

Cloudflare passes env bindings per-request, so services are built from `env`
rather than at module load. `setupServices(env, factories)` is exported from
`@pikku/cloudflare` and is what the factories call:

```typescript
import { setupServices } from '@pikku/cloudflare'

const services = await setupServices(env, {
  createConfig,
  createSingletonServices,
})
```

**Do not hand-roll this.** Beyond building `LocalVariablesService` /
`LocalSecretService` and caching the result, it calls `setSingletonServices()` —
and the core runners (`fetchData`, `runQueueJob`, `runScheduled`) resolve
services through that global slot, _not_ through the value you were returned. A
setup function that only returns the services leaves every request throwing
"Singleton services not initialized" as a CF `1101`. It also stashes the env via
`setCloudflareEnv`, which `getCloudflareEnv()` reads for bindings.

## HTTP

`runFetch(request, websocketHibernationServer?, options?)`:

- A `GET` with `Upgrade: websocket` is routed to the hibernation server. Without
  one passed in it answers **426**, so a channel worker that forgets the second
  argument fails every upgrade while plain HTTP keeps working.
- `CF-Ray` becomes the traceId when present, so a Cloudflare trace and a Pikku
  trace line up without extra wiring.
- `options.exposeErrors` defaults to **`false`** — error detail is withheld from
  responses unless you opt in.

## Scheduled Tasks

`runScheduled(controller)` matches registered tasks against
`controller.cron` and **returns after the first match**. Two tasks sharing one
cron expression means only one of them ever runs — give each its own expression,
or invoke `runScheduledTask({ name })` per task yourself.

## WebSocket (Durable Objects)

The ready-made DO class is exported; re-export it under the binding name and
point the worker at it:

```typescript
export { PikkuWebSocketHibernationServer as WebSocketHibernationServer } from '@pikku/cloudflare'
export default createCloudflareWebSocketHandler({
  createConfig,
  createSingletonServices,
})
```

Subclass `CloudflareWebSocketHibernationServer` only when you need something
`getParams()` cannot express — it is abstract with one method returning
`{ singletonServices, createWireServices? }`. The channel store
(`CloudflareWebsocketStore` over the DO's own storage), the event hub and the
channel handler factory are all built by the base class; do not supply them.

The router looks up the DO through the **`WEBSOCKET_HIBERNATION_SERVER`**
binding and answers `503` naming it if the binding is missing, so declare it in
`wrangler.toml` under exactly that name.

A throw during `onConnect` closes the socket with `1008` and answers `403
Forbidden` with a deliberately generic body — an auth denial and a genuine fault
look identical to the client. The real reason is on the logger, so read the
worker logs rather than the status code.
