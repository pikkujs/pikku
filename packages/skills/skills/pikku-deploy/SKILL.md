---
name: pikku-deploy
description: >-
  Use when deploying a Pikku app to a runtime — Express, Fastify, uWebSockets.js, the `ws` library,
  Next.js, AWS Lambda, Cloudflare Workers or Azure Functions. Covers the bootstrap every runtime
  shares, choosing between them, and the behaviour that differs: which accept
  `RunHTTPWiringOptions`, how each one runs scheduled tasks, and where CORS and health checks live.
  TRIGGER when: writing or debugging `start.ts` / a worker entry / a Lambda handler, code imports
  `@pikku/express`, `@pikku/fastify`, `@pikku/uws`, `@pikku/ws`, `@pikku/next`, `@pikku/lambda`,
  `@pikku/cloudflare` or `@pikku/azure-functions`, or the user asks how to serve, host or deploy a
  Pikku app. DO NOT TRIGGER when: defining functions or wirings with no runtime-specific code.
installGroups: [core]
---

# Pikku Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Signatures and option keys come from `pikku doc` — run `pikku doc --ai` for the
installed surface. This skill is the part the compiler cannot tell you: which
runtime to pick, and what each one does differently once you have.

## Pick a runtime

Two families, and the difference decides how you write the entry file.

**Long-running servers** own a process. Services are built once at startup and
live in module scope for the life of the server.

| Runtime | Package | Reach for it when |
| --- | --- | --- |
| Express | `@pikku/express` | An existing Express app, or you want static assets and upload handling |
| Fastify | `@pikku/fastify` | An existing Fastify app, or you want its stricter defaults |
| uWebSockets.js | `@pikku/uws` | Highest throughput, HTTP and WebSocket on one port |
| ws | `@pikku/ws` | WebSocket only, attached to an `http.Server` you own |

**Per-invocation runtimes** are handed a request and torn down. Services are
cached in module scope across warm invocations, and the deploy codegen writes
that caching for you.

| Runtime | Package | Reach for it when |
| --- | --- | --- |
| AWS Lambda | `@pikku/lambda` | API Gateway, EventBridge, SQS |
| Cloudflare Workers | `@pikku/cloudflare` | Edge, Durable Objects for channels |
| Azure Functions | `@pikku/azure-functions` | Azure hosting — note channels are not implemented |
| Next.js | `@pikku/next` | Pikku behind Next routes, or RPC from Server Components |

Then read the reference for the one you picked: `references/express.md`,
`references/fastify.md`, `references/uws.md`, `references/ws.md`,
`references/nextjs.md`, `references/lambda.md`, `references/cloudflare.md`,
`references/azure.md`.

## The bootstrap every runtime shares

Importing the generated bootstrap registers your wirings; nothing routes without
it. `createConfig` and `createSingletonServices` come from your own
`services.ts`.

```typescript
import './.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from './services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)
```

A long-running server takes it from there. A per-invocation runtime wraps the
same two calls in a memoised factory, because the module may be reused across
invocations — every `@pikku/*` serverless package ships those factories, and
hand-written handlers are for the cases the deploy codegen does not cover.

## What differs, and where it bites

### `RunHTTPWiringOptions` is not accepted everywhere

`maxBodySize`, `respondWith404`, `coerceDataFromSchema` and `bubbleErrors` reach
the request only on the runtimes that thread them through.

| Runtime | Accepts options | Where an oversized body is actually stopped |
| --- | --- | --- |
| Express | `init(httpOptions)` | The `express.json` parser limit, fed by `maxBodySize` |
| Fastify | `init(httpOptions)` | Fastify's own `bodyLimit`, set from `maxBodySize` |
| uWS | HTTP handler only | The handler counts bytes itself and answers `413` |
| ws | Yes, on the handler | `maxPayload` on the `WebSocketServer` |
| Next.js | Only via your own `PikkuNextJS` handler | Next's own limits |
| Lambda | **No** | API Gateway's payload limit |
| Cloudflare | Partially — `runFetch(request, hibernation, options)` | The platform's limit |
| Azure | **No** | Azure's request limits |

On Fastify, leaving `maxBodySize` unset keeps Fastify's stricter 1MB default
rather than loosening it to Pikku's 10MB fallback. On uWS the chunks are dropped
rather than concatenated, so an oversized request never accumulates in memory.

### Scheduled tasks run differently on all three serverless runtimes

Same `wireScheduler` declaration, three behaviours. This is the one most likely
to produce a silent production bug.

- **Cloudflare** matches `controller.cron` and **returns after the first match**.
  Two tasks sharing a cron expression means only one ever runs.
- **Lambda** runs **every** task in the bundle, ignores the event, and logs
  rather than rethrows a failure — one bad task cannot stop the others.
- **Azure** runs **every** task in the bundle, ignores both the timer argument
  and each task's own cron, and does **not** catch per-task failures — the first
  throw aborts the rest.

Where a runtime runs everything in the bundle, the deployment unit is what
decides which tasks fire, not the schedule you wrote. Reach for
`runScheduledTask({ name })` when one deployment genuinely bundles several tasks
that must fire separately.

### CORS and health checks are not uniform

- **Express** registers the health check in the **constructor**, so it answers
  before any middleware and cannot be wrapped in auth. `enableCors` must be
  called before `init()`.
- **Fastify** registers it in `init()`, so nothing answers before that runs. Its
  `enableCors` exists but **throws `Method not implemented.`** — register
  `@fastify/cors` yourself.
- **uWS** registers it in `init()` and has **no** `enableCors`, no static assets
  and no `content` support at all.
- Serverless runtimes have neither; the platform in front of them owns both.
  On Lambda, only `runFetchV2` echoes the request `Origin`, so v1 preflights
  fail in the browser unless API Gateway or CloudFront adds the header.

### Channels need a shared store off a single process

A long-running server can hold channel state in memory. Every per-invocation
runtime cannot: `$connect` and `$default` are separate invocations, so
`channelStore` must be a real shared store (`PgChannelStore` and friends).
Cloudflare instead keeps state in a Durable Object, and **Azure has no channel
support** — `createAzureWebSocketHandler` is a stub that answers `501`.

## What NOT to do

- Do not hand-roll Cloudflare's `setupServices`. It calls
  `setSingletonServices()`, and the core runners resolve through that global
  slot rather than the value you were returned — a setup that only returns
  services leaves every request throwing "Singleton services not initialized" as
  a CF `1101`.
- Do not discard what a Lambda WebSocket handler returns.
  `connectWebsocket` returns a complete `APIGatewayProxyResult`; answering a
  hardcoded `200` instead accepts every connection, including the ones your
  channel's auth rejected.
- Do not bind a `WebSocketServer` to the HTTP server on `ws` or uWS.
  `noServer: true` is required, not stylistic — the handler performs the upgrade
  itself so middleware and auth run against the upgrade request first.
- Do not assume a runtime rethrows. Express, Azure and Lambda's `runFetch` each
  swallow or flatten errors differently; the reference for your runtime says
  which.
