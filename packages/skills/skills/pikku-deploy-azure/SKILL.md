---
name: pikku-deploy-azure
description: >-
  Use when deploying a Pikku app to Azure Functions. Covers createAzureHandler for HTTP, storage
  queue and timer triggers, plus AzInvocationLogger and PikkuAZTimerRequest. TRIGGER when: user
  asks about Azure Functions, Azure deployment, or @pikku/azure-functions. DO NOT TRIGGER when:
  user asks about AWS Lambda (use pikku-deploy-lambda) or Cloudflare Workers (use
  pikku-deploy-cloudflare).
---

# Pikku Azure Functions Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

`@pikku/azure-functions` provides Azure Functions runtime adapters for Pikku.

## Installation

```bash
yarn add @pikku/azure-functions @azure/functions
```

## API Reference

Exported from `@pikku/azure-functions`:

- `createAzureHandler(factories, handlerTypes)` — the entry point. Returns
  `{ http?, queue?, timer? }` for the handler types you ask for.
- `createAzureWorkerHandler(factories)` — `createAzureHandler(factories, ['fetch'])`.
- `createAzureWebSocketHandler(factories)` — **a stub**: its `negotiate` always
  answers `501 WebSocket via Azure Web PubSub not yet implemented`. Channels do
  not work on Azure yet; do not plan a deployment around it.
- `AzInvocationLogger` — the logger. Note the name: there is no
  `PikkuAzFunctionsLogger`.
- `PikkuAZTimerRequest` — `new PikkuAZTimerRequest(context, data)`, a
  `PikkuRequest` carrying the data. The context argument is accepted and
  ignored.
- `AzureQueueService`, `AzureDeploymentService`.

`factories` is `{ createConfig, createSingletonServices, createPlatformServices? }`.
Services are built from `process.env` and cached in module scope across
invocations of the same instance.

## Usage Patterns

### Registering handlers

```typescript
import { app } from '@azure/functions'
import { createAzureHandler } from '@pikku/azure-functions'
import { createConfig, createSingletonServices } from './services.js'
import './.pikku/pikku-bootstrap.gen.js'

const handlers = createAzureHandler(
  { createConfig, createSingletonServices },
  ['fetch', 'queue', 'scheduled']
)

app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  route: '{*path}',
  handler: handlers.http as any,
})

app.storageQueue('queue', {
  queueName: 'my-queue',
  connection: 'AzureWebJobsStorage',
  handler: handlers.queue as any,
})

app.timer('scheduler', {
  schedule: '0 */5 * * * *',
  handler: handlers.timer as any,
})
```

Note the key names: `handlerTypes` uses **`scheduled`**, but the handler it
returns is **`timer`**.

### HTTP

The handler buffers the whole body, converts to a standard `Request`, and
returns the response body as **text** — a streaming or binary response is
flattened. It takes no `RunHTTPWiringOptions`, so there is no `maxBodySize` or
`respondWith404` here; Azure's own request limits are the bound. A thrown error
is logged to `console.error` and whatever the response already holds is
returned.

### Queue

The queue name comes from the message's own `queueName`, falling back to
`context.triggerMetadata.queueTrigger` and then `'unknown'` — a name that does
not match a wired queue means the job has no handler. `attemptsMade` is read
from `dequeueCount`, and `waitForCompletion` throws: Azure Storage Queues are
fire-and-forget. A failing job throws out of the handler, so retries and the
poison queue are governed by `host.json`, not by Pikku.

Producer side, `AzureQueueService(connectionString?)` falls back to
`AzureWebJobsStorage` and throws at construction if neither is set. Messages are
base64-encoded (Azure requires it), `delay` is milliseconds mapped to
`visibilityTimeout` in whole seconds capped at 7 days, `supportsResults` is
`false` and `getJob()` always throws. The queue name is remapped through
`AZURE_QUEUE_NAME_<SCREAMING_SNAKE>` when that variable exists, otherwise used
as-is.

### Timer

The timer handler runs **every** scheduled task registered in the bundle,
ignoring both the `Timer` argument and each task's own cron expression. Unlike
the Lambda equivalent it does not catch per-task failures, so the first task
that throws aborts the ones after it — keep one schedule per function app, or
guard the task bodies yourself.

### Logging

`new AzInvocationLogger(context)` forwards to the invocation context's
`info`/`warn`/`error`/`debug`/`trace`. `setLevel()` is a **no-op**: every level
is emitted and filtering has to be done in Azure's own logging configuration.
