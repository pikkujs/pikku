---
name: pikku-deploy-lambda
description: >-
  Use when deploying a Pikku app to AWS Lambda. Covers HTTP handlers, scheduled tasks, SQS queue
  workers, WebSocket via API Gateway, and cold start caching. TRIGGER when: code imports
  @pikku/lambda, user mentions Lambda/serverless/AWS deployment, or handler files export
  Lambda-typed functions. DO NOT TRIGGER when: just defining functions/wirings without
  Lambda-specific code.
---

# Pikku AWS Lambda Deployment

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

```bash
yarn add @pikku/lambda
```

## Cold Start Pattern

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

## HTTP Handler

```typescript
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'

export const httpRoute = async (event: APIGatewayProxyEvent) => {
  await coldStart()
  return await runFetch(event)
}
```

## Scheduled Tasks

```typescript
import type { ScheduledHandler } from 'aws-lambda'
import { runScheduledTask } from '@pikku/core/scheduler'

export const myScheduledTask: ScheduledHandler = async () => {
  await coldStart()
  await runScheduledTask({ name: 'myScheduledTask' })
}
```

## SQS Queue Worker

```typescript
import type { SQSHandler } from 'aws-lambda'
import { runSQSQueueWorker } from '@pikku/lambda/queue'

export const mySQSWorker: SQSHandler = async (event) => {
  const { logger } = await coldStart()
  return runSQSQueueWorker(logger, event)
}
```

## WebSocket (API Gateway v2)

```typescript
import {
  connectWebsocket,
  disconnectWebsocket,
  processWebsocketMessage,
  LambdaEventHubService,
} from '@pikku/lambda/websocket'

export const connectHandler = async (event) => {
  const params = await getParams(event)
  await connectWebsocket(event, params)
  return { statusCode: 200, body: '' }
}

export const disconnectHandler = async (event) => {
  const params = await getParams(event)
  return await disconnectWebsocket(event, params)
}

export const defaultHandler = async (event) => {
  const params = await getParams(event)
  return await processWebsocketMessage(event, params)
}
```

WebSocket requires a `ChannelStore` (e.g., `PgChannelStore`) and `LambdaEventHubService` for cross-connection messaging.
