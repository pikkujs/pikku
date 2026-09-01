# AWS Lambda

```bash
yarn add @pikku/lambda
```

## Cold start pattern

Cache singleton services across Lambda invocations:

```typescript
// cold-start.ts
import './.pikku/pikku-bootstrap.gen.js'
import { createConfig, createSingletonServices } from './services.js'

let singletonServices: SingletonServices | undefined

export const coldStart = async () => {
  if (!singletonServices) {
    const config = await createConfig()
    singletonServices = await createSingletonServices(config)
  }
  return singletonServices
}
```

If the deploy codegen generated your handlers, this caching is already done for
you by the factories in `@pikku/lambda` — `createLambdaHandler(factories,
handlerTypes)`, `createLambdaWorkerHandler(factories)` and
`createLambdaWebSocketHandler(factories)`. They build `variables`/`secrets` from
`process.env`, cache the singleton services in module scope, and return the
named exports (`handler`, `queue`, `scheduled`, or `connect`/`disconnect`/
`default`) that `serverless.yml` references. Hand-written handlers are for cases
the codegen does not cover.

## HTTP handler

Pick the entry point that matches the API Gateway payload version — they take
different event types and are not interchangeable:

```typescript
import type { APIGatewayEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http' // REST API / payload v1

export const httpRoute = async (event: APIGatewayEvent) => {
  await coldStart()
  return await runFetch(event)
}
```

```typescript
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { runFetchV2 } from '@pikku/lambda/http' // HTTP API / payload v2

export const httpRoute = async (event: APIGatewayProxyEventV2) => {
  await coldStart()
  return await runFetchV2(event)
}
```

Both answer `OPTIONS` themselves before Pikku's wirings run, so a preflight
never reaches your middleware. Only `runFetchV2` echoes the request `Origin`
into `Access-Control-Allow-Origin`; `runFetch` sets allowed headers and methods
but **no origin header at all**, so v1 preflights fail in the browser unless
API Gateway or a CloudFront layer adds one.

They also differ on failure: `runFetchV2` logs and returns a JSON `500`, while
`runFetch` swallows the error and returns whatever status the response already
carried.

Neither takes `RunHTTPWiringOptions` — there is no `maxBodySize` or
`respondWith404` knob here; API Gateway's own payload limit is the bound.

## Scheduled tasks

```typescript
import type { ScheduledHandler } from 'aws-lambda'
import { runLambdaScheduled } from '@pikku/lambda/scheduled'

export const scheduled: ScheduledHandler = async (event) => {
  await coldStart()
  await runLambdaScheduled(event)
}
```

`runLambdaScheduled` runs **every** scheduled task registered in the bundle,
each with its own `cron-<uuid>` traceId, and logs rather than rethrows a task
failure — so one bad task cannot fail the invocation or stop the others. The
event itself is ignored; which tasks run is decided by what the unit bundled,
not by which EventBridge rule fired.

Reach for `runScheduledTask({ name })` from `@pikku/core/scheduler` directly
only when one Lambda genuinely bundles several tasks that must fire on separate
schedules.

## SQS queue worker

```typescript
import type { SQSHandler } from 'aws-lambda'
import { runSQSQueueWorker } from '@pikku/lambda/queue'

export const mySQSWorker: SQSHandler = async (event) => {
  const { logger } = await coldStart()
  return runSQSQueueWorker(logger, event)
}
```

The worker returns an `SQSBatchResponse` listing the failed messages in
`batchItemFailures`, which SQS only honours when the event source mapping has
**`ReportBatchItemFailures`** enabled. Without it the whole batch is retried
when any one message fails, so successfully processed jobs run twice.

Records are processed in parallel, and the queue name is taken from the last
segment of `eventSourceARN` — it must match the name the worker was wired under.
A `QueueJobDiscardedError` counts as success (no retry); anything else is
reported as a failed item.

`waitForCompletion` throws on an SQS job: the transport is fire-and-forget.

On the producer side, `SQSQueueService` resolves each queue URL from the
constructor's `queueUrlMap` first, then from
`SQS_QUEUE_URL_<SCREAMING_SNAKE_NAME>`, and throws naming the missing variable
if neither has it. `supportsResults` is `false` and `getJob()` always throws —
use BullMQ or PgBoss if you need results. `delay` is milliseconds, rounded up to
whole seconds and capped at SQS's 900s ceiling.

## WebSocket (API Gateway v2)

```typescript
import {
  connectWebsocket,
  disconnectWebsocket,
  processWebsocketMessage,
  LambdaEventHubService,
} from '@pikku/lambda/websocket'

const params = async (event) => {
  const { channelStore } = await coldStart()
  return { channelStore }
}

export const connectHandler = async (event) =>
  await connectWebsocket(event, await params(event))

export const disconnectHandler = async (event) =>
  await disconnectWebsocket(event, await params(event))

export const defaultHandler = async (event) =>
  await processWebsocketMessage(event, await params(event))
```

All three take the same `{ channelStore }` and **return a complete
`APIGatewayProxyResult`** — return it. Discarding `connectWebsocket`'s result
and answering a hardcoded `200` accepts every connection, including the ones
your channel's auth rejected.

`channelStore` (e.g. `PgChannelStore`) must be a real shared store: each route
is a separate invocation, so nothing survives in memory between `$connect` and
`$default`.

`LambdaEventHubService` handles cross-connection messaging and takes
`(logger, event, channelStore, eventHubStore)` — the `event` is needed to derive
the API Gateway Management endpoint, so it is constructed per invocation, not
once at cold start. It also needs an `EventHubStore` alongside the channel store.

Two behaviours to design around: **binary payloads throw** (`Binary data is not
supported on serverless lambdas`), and any `PostToConnection` failure removes
the connection from the channel store — a transient error drops a live client,
not just a stale one.
