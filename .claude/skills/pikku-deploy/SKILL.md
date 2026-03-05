---
name: pikku-deploy
description: 'Use when deploying a Pikku app to Express, Fastify, uWebSockets.js, AWS Lambda, Cloudflare Workers, Next.js, or MCP. Covers runtime adapter setup, server bootstrap, and serverless handlers.'
---

# Pikku Deployment (Runtime Adapters)

Every Pikku app follows the same bootstrap pattern regardless of runtime. Your business logic stays the same — only the server setup changes.

## Common Bootstrap Pattern

All runtimes share this structure:

```typescript
import './.pikku/pikku-bootstrap.gen.js'  // Register all wirings
import { createConfig, createSingletonServices } from './services.js'

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

// Then pick your runtime below...
```

## Express

```bash
yarn add @pikku/express
```

```typescript
import { PikkuExpressServer } from '@pikku/express'

const appServer = new PikkuExpressServer(
  { ...config, port: 4002, hostname: 'localhost' },
  singletonServices.logger
)
appServer.enableExitOnSigInt()
await appServer.init()
await appServer.start()
```

**Constructor:** `new PikkuExpressServer(config, logger)`

**Config extends CoreConfig with:**
- `port: number`
- `hostname: string`
- `healthCheckPath?: string`
- `limits?: Partial<Record<string, string>>`
- `content?: LocalContentConfig` (for static assets / file uploads)

**Methods:**
- `init(httpOptions?): Promise<void>` — Register middleware and routes
- `start(): Promise<void>` — Start listening
- `stop(): Promise<void>` — Graceful shutdown
- `enableExitOnSigInt(): Promise<void>` — SIGINT handler
- `enableCors(options): void` — Enable CORS
- `enableStaticAssets(): void` — Serve static files (requires `content` config)

**Property:** `app: Express` — Direct access to Express instance for custom middleware.

### Express Middleware (existing app)

```bash
yarn add @pikku/express-middleware
```

```typescript
import express from 'express'
import { pikkuExpressMiddleware } from '@pikku/express-middleware'

const app = express()
app.use(pikkuExpressMiddleware({
  logger: singletonServices.logger,
  logRoutes: true,
  loadSchemas: true,
}))
```

## Fastify

```bash
yarn add @pikku/fastify
```

```typescript
import { PikkuFastifyServer } from '@pikku/fastify'

const appServer = new PikkuFastifyServer(
  { ...config, hostname: 'localhost', port: 4002 },
  singletonServices.logger
)
appServer.enableExitOnSigInt()
await appServer.init()
await appServer.start()
```

**Constructor:** `new PikkuFastifyServer(config, logger)`

**Config extends CoreConfig with:** `port`, `hostname`, `healthCheckPath?`

**Methods:** Same as Express (`init`, `start`, `stop`, `enableExitOnSigInt`).

**Property:** `app: FastifyInstance` — Direct access to Fastify instance.

### Fastify Plugin (existing app)

```bash
yarn add @pikku/fastify-plugin
```

```typescript
import Fastify from 'fastify'
import pikkuFastifyPlugin from '@pikku/fastify-plugin'

const app = Fastify()
app.register(pikkuFastifyPlugin, {
  pikku: {
    logger: singletonServices.logger,
    logRoutes: true,
    loadSchemas: true,
  },
})
```

## uWebSockets.js

```bash
yarn add @pikku/uws
```

```typescript
import { PikkuUWSServer } from '@pikku/uws'

const appServer = new PikkuUWSServer(
  { ...config, hostname: 'localhost', port: 4002 },
  singletonServices.logger
)
appServer.enableExitOnSigInt()
await appServer.init()
await appServer.start()
```

**Constructor:** `new PikkuUWSServer(config, logger)`

Handles both HTTP and WebSocket automatically. Highest performance option.

## WebSocket Standalone (ws)

```bash
yarn add @pikku/ws
```

```typescript
import { pikkuWebsocketHandler } from '@pikku/ws'
import { Server } from 'http'
import { WebSocketServer } from 'ws'

const server = new Server()
const wss = new WebSocketServer({ noServer: true })

pikkuWebsocketHandler({
  server,
  wss,
  logger: singletonServices.logger,
})

server.listen(4002, 'localhost', () => {
  console.log('Server running at http://localhost:4002/')
})
```

## AWS Lambda

```bash
yarn add @pikku/lambda
```

```typescript
import type { APIGatewayProxyEvent, ScheduledHandler, SQSHandler } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
import { runSQSQueueWorker } from '@pikku/lambda/queue'
import { runScheduledTask } from '@pikku/core/scheduler'

// HTTP handler
export const httpRoute = async (event: APIGatewayProxyEvent) => {
  await coldStart()
  return await runFetch(event)
}

// Scheduled task handler
export const myScheduledTask: ScheduledHandler = async () => {
  await coldStart()
  await runScheduledTask({ name: 'myScheduledTask' })
}

// SQS queue worker
export const mySQSWorker: SQSHandler = async (event) => {
  const { logger } = await coldStart()
  return runSQSQueueWorker(logger, event)
}
```

**Cold start pattern** — cache singleton services across invocations:

```typescript
let singletonServices: SingletonServices | undefined

export const coldStart = async () => {
  if (!singletonServices) {
    const config = await createConfig()
    singletonServices = await createSingletonServices(config)
  }
  return singletonServices
}
```

### AWS Lambda WebSocket

```bash
yarn add @pikku/lambda
```

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

## Cloudflare Workers

```bash
yarn add @pikku/cloudflare
```

```typescript
import { runFetch, runScheduled } from '@pikku/cloudflare'

export default {
  async scheduled(controller, env) {
    await setupServices(env)
    await runScheduled(controller)
  },

  async fetch(request, env): Promise<Response> {
    await setupServices(env)
    return await runFetch(request as unknown as Request)
  },
} satisfies ExportedHandler<Record<string, string>>
```

**Service setup** — Cloudflare passes env variables per-request:

```typescript
import { LocalVariablesService, LocalSecretService } from '@pikku/core/services'

export const setupServices = async (env: Record<string, string | undefined>) => {
  const localVariables = new LocalVariablesService(env)
  const config = await createConfig(localVariables)
  const localSecrets = new LocalSecretService(localVariables)
  return await createSingletonServices(config, {
    variables: localVariables,
    secrets: localSecrets,
  })
}
```

### Cloudflare WebSocket (Durable Objects)

```typescript
import { CloudflareWebSocketHibernationServer } from '@pikku/cloudflare'

export class WebSocketHibernationServer extends CloudflareWebSocketHibernationServer {
  protected async getParams() {
    const singletonServices = await setupServices(this.env)
    return { singletonServices }
  }
}
```

## Next.js

```bash
yarn add @pikku/next
```

**API Route handler** (generated by `npx pikku`):

```typescript
// app/api/[...route]/route.ts
import { pikkuAPIRequest } from '@/pikku-nextjs.gen.js'

export const GET = pikkuAPIRequest
export const POST = pikkuAPIRequest
export const PUT = pikkuAPIRequest
export const PATCH = pikkuAPIRequest
export const DELETE = pikkuAPIRequest
```

**Server-side data fetching** (generated):

```typescript
import { pikku } from '@/pikku-nextjs.gen.js'

// In a Server Component or Server Action
const { get, post, rpc, staticGet } = pikku()

// Dynamic (reads headers/cookies — requires request context)
const todos = await get('/todos')

// Static (no request context — suitable for precompile/ISR)
const config = await staticGet('/config')

// RPC calls
const result = await rpc('calculateTax', { amount: 100, region: 'US' })
```

**Constructor:** `new PikkuNextJS(createConfig, createSingletonServices)` — lazy-initializes on first request.

## MCP Server

```bash
yarn add @pikku/modelcontextprotocol
```

```typescript
import { PikkuMCPServer } from '@pikku/modelcontextprotocol'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import mcpJSON from './.pikku/mcp/mcp.gen.json' with { type: 'json' }

const server = new PikkuMCPServer(
  {
    name: 'my-mcp-server',
    version: '1.0.0',
    mcpJSON,
    capabilities: {
      logging: {},
      tools: {},
      resources: {},
      prompts: {},
    },
  },
  singletonServices.logger
)

await server.init()
const transport = new StdioServerTransport()
await server.connect(transport)
singletonServices.logger = server.createMCPLogger()
```

## Runtime Comparison

| Runtime | Package | Type | HTTP | WebSocket | Scheduler | Queue |
|---------|---------|------|------|-----------|-----------|-------|
| Express | `@pikku/express` | Server | Yes | No | Via service | Via service |
| Fastify | `@pikku/fastify` | Server | Yes | No | Via service | Via service |
| uWS | `@pikku/uws` | Server | Yes | Yes | Via service | Via service |
| ws | `@pikku/ws` | Handler | No | Yes | No | No |
| Lambda | `@pikku/lambda` | Serverless | Yes | Yes* | Yes | Yes (SQS) |
| Cloudflare | `@pikku/cloudflare` | Serverless | Yes | Yes* | Yes | No |
| Next.js | `@pikku/next` | Framework | Yes | No | No | No |
| MCP | `@pikku/modelcontextprotocol` | Server | No | No | No | No |

\* WebSocket requires separate handler/package
