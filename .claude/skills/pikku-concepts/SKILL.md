---
name: pikku-concepts
description: 'Foundational guide to Pikku framework concepts. Use this skill when working with any Pikku codebase, starting a new Pikku project, or migrating a backend to Pikku. Covers the core mental model, function types, project structure, code generation, testing, and how Pikku maps to traditional backend patterns.'
---

# Pikku Framework Concepts

Pikku is a TypeScript framework that separates business logic from transport mechanisms. You define a function once, then wire it to HTTP, WebSocket, queues, schedulers, MCP, CLI, or RPC — without the function knowing how it's being called.

For deep-dive on each topic, see the dedicated skills:
- **Wiring**: `pikku-http`, `pikku-websocket`, `pikku-rpc`, `pikku-mcp`, `pikku-queue`, `pikku-cron`, `pikku-trigger`, `pikku-cli`, `pikku-ai-agent`, `pikku-workflow`
- **Infrastructure**: `pikku-services`, `pikku-security`, `pikku-config`
- **Project introspection**: `pikku-info`

## Core Mental Model

```
pikkuFunc (pure business logic)
    │
    ├── wireHTTP        → Express, Fastify, Next.js, Lambda, Cloudflare...
    ├── wireChannel     → WebSocket (real-time)
    ├── wireQueueWorker → BullMQ, PgBoss (async jobs)
    ├── wireScheduler   → Cron (scheduled tasks)
    ├── wireMCPTool     → Model Context Protocol (AI tools)
    ├── wireCLI         → CLI commands
    ├── wireTrigger     → Event-driven (Redis pub/sub, PG LISTEN/NOTIFY)
    ├── pikkuAIAgent    → AI agents / chatbots
    ├── pikkuWorkflow   → Multi-step durable workflows
    └── wire.rpc        → Internal function-to-function calls
```

A `pikkuFunc` receives three things:

1. **Services** — injected dependencies (logger, db, jwt, custom stores). See `pikku-services`.
2. **Data** — input from any source (HTTP body/query/params, WS message, queue payload, CLI args)
3. **Wire** — transport context (session, channel, rpc, mcp, http, queue)

The function never imports Express, never reads `req.body`, never touches `ws.send()`. It just works with typed data and services.

## Concept Mapping: Generic Backend → Pikku

| Generic Backend Concept                 | Pikku Equivalent                                                | Skill               |
| --------------------------------------- | --------------------------------------------------------------- | -------------------- |
| **Controller / Route Handler**          | `pikkuFunc` / `pikkuSessionlessFunc`                            | (this skill)         |
| **Route definition** (`GET /users/:id`) | `wireHTTP({ route, method, func })`                             | `pikku-http`         |
| **Middleware** (Express/Koa-style)      | `pikkuMiddleware`                                               | `pikku-security`     |
| **Auth Guard / Auth Middleware**        | `authBearer()` / `authCookie()` / `authApiKey()`                | `pikku-security`     |
| **Authorization / Permissions**         | `pikkuPermission` / `pikkuAuth`                                 | `pikku-security`     |
| **DTO / Request Validation**            | Standard Schema (Zod, Valibot, ArkType)                         | (this skill)         |
| **Dependency Injection**                | `pikkuServices` (singleton) + `pikkuWireServices` (per-request) | `pikku-services`     |
| **WebSocket handlers**                  | `wireChannel`                                                   | `pikku-websocket`    |
| **Job Queue workers**                   | `wireQueueWorker`                                               | `pikku-queue`        |
| **Cron / Scheduled tasks**              | `wireScheduler`                                                 | `pikku-cron`         |
| **Module / Feature grouping**           | Tags + wiring files                                             | (this skill)         |
| **Error handling**                      | Throw typed errors (`NotFoundError`, `ForbiddenError`)          | (this skill)         |
| **Type-safe API client**                | `npx pikku prebuild` generates clients                          | (this skill)         |
| **Secrets / Config**                    | `wireSecret`, `wireVariable`, `services.variables`              | `pikku-config`       |

## Functions

Three main function types:

```typescript
// Requires authentication — receives session in wire context
const updateTodo = pikkuFunc<UpdateInput, TodoOutput>(
  async (services, data, wire) => {
    const session = await wire.session.get()
    return services.todoStore.update(data.id, data)
  }
)

// No authentication required
const listTodos = pikkuSessionlessFunc<ListInput, TodoListOutput>(
  async (services, data) => {
    return { todos: services.todoStore.list(data.filters) }
  }
)

// No input or output (for scheduled tasks, lifecycle hooks)
const cleanup = pikkuVoidFunc(async (services) => {
  services.todoStore.cleanOldItems()
})
```

Config object form (recommended):

```typescript
const createTodo = pikkuSessionlessFunc({
  title: 'Create Todo',
  description: 'Create a new todo item',
  input: CreateTodoInputSchema,
  output: CreateTodoOutputSchema,
  func: async ({ logger, todoStore }, { title, priority }) => {
    const todo = todoStore.createTodo(title, priority)
    logger.info(`Created todo: ${todo.id}`)
    return { todo }
  },
})
```

Full config options:

```typescript
pikkuFunc({
  title?: string,           // Human-readable name
  description?: string,     // What the function does
  version?: number,         // Contract version (see pikku-config for versioning)
  tags?: string[],          // For grouping and middleware targeting
  expose?: boolean,         // Allow external RPC calls (see pikku-rpc)
  remote?: boolean,         // Allow remote RPC calls
  mcp?: boolean,            // Expose as MCP tool (see pikku-mcp)
  auth?: boolean,           // Override default auth requirement
  input?: ZodSchema,        // Input validation schema
  output?: ZodSchema,       // Output validation schema
  permissions?: PermissionGroup,  // See pikku-security
  middleware?: PikkuMiddleware[], // See pikku-security
  func: async (services, data, wire) => { ... },
})
```

## Schemas (Validation)

Pikku uses Standard Schema — works with Zod, Valibot, ArkType:

```typescript
import { z } from 'zod'

const CreateTodoInputSchema = z.object({
  title: z.string().min(1).max(200),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).optional(),
})
```

Schemas serve triple duty: runtime validation, TypeScript types, and OpenAPI documentation.

## Server Bootstrap

Every Pikku app follows the same bootstrap pattern regardless of runtime:

```typescript
import '../../functions/.pikku/pikku-bootstrap.gen.js' // Generated — registers all wirings

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

// Pick your runtime:
const server = new PikkuFastifyServer(config, singletonServices, createWireServices)
// or: new PikkuExpressServer(config, singletonServices, createWireServices)
// or: pikkuAWSLambdaHandler(singletonServices)
// or: PikkuCloudflareHandler(singletonServices)
// or: pikkuNextHandler(singletonServices)

await server.init()
await server.start()
```

## Code Generation

Run `npx pikku prebuild` to generate:

- `pikku-types.gen.ts` — Typed function factories and wiring functions
- `pikku-fetch.gen.ts` — Type-safe HTTP client
- `pikku-websocket.gen.ts` — Type-safe WebSocket client
- `pikku-bootstrap.gen.js` — Runtime initialization (auto-imports all wirings)
- `pikku-services.gen.ts` — Service factory types

Config lives in `pikku.config.json`:

```json
{
  "tsconfig": "./tsconfig.json",
  "srcDirectories": ["src"],
  "outDir": ".pikku"
}
```

## Project Structure Convention

```
src/
├── functions/           # Business logic (pikkuFunc definitions)
│   ├── todos.functions.ts
│   ├── auth.functions.ts
│   └── scheduled.functions.ts
├── wirings/             # Transport bindings
│   ├── todos.http.ts
│   ├── channel.wiring.ts
│   ├── scheduler.wiring.ts
│   └── queue.wiring.ts
├── schemas.ts           # Zod/Valibot schemas
├── services.ts          # Service factories (see pikku-services)
├── middleware.ts         # Middleware definitions (see pikku-security)
├── permissions.ts       # Permission definitions (see pikku-security)
└── .pikku/              # Generated (gitignored)
    ├── pikku-types.gen.ts
    ├── pikku-fetch.gen.ts
    └── pikku-bootstrap.gen.js
```

## Environment Variables

Never use `process.env` inside Pikku functions. Use the `variables` service (see `pikku-config`):

```typescript
const apiKey = services.variables.get('API_KEY')
```

`process.env` belongs in server bootstrap code (`start.ts`) only.

## Testing

Functions are easily testable because they're pure:

```typescript
const mockServices = {
  logger: new MockLogger(),
  todoStore: new MockTodoStore(),
}

// Call function directly — no HTTP, no framework
const result = await listTodos.func(mockServices, { userId: 'test' })
expect(result.todos).toHaveLength(3)
```

## Available Packages

### Runtime Adapters

| Package                       | Use Case                              |
| ----------------------------- | ------------------------------------- |
| `@pikku/express-server`       | Express standalone server             |
| `@pikku/express-middleware`    | Express as middleware in existing app  |
| `@pikku/fastify-server`       | Fastify standalone                    |
| `@pikku/fastify-plugin`       | Fastify plugin                        |
| `@pikku/next`                 | Next.js API routes                    |
| `@pikku/aws-lambda`           | AWS Lambda handlers                   |
| `@pikku/cloudflare`           | Cloudflare Workers                    |
| `@pikku/uws-server`           | uWebSockets.js (high perf)            |
| `@pikku/modelcontextprotocol` | MCP server                            |

### Service Packages

| Package                  | Provides                           |
| ------------------------ | ---------------------------------- |
| `@pikku/jose`            | JWT (sign/verify) via jose library |
| `@pikku/schema-ajv`      | Schema validation via AJV          |
| `@pikku/schema-cfworker` | Schema validation for Cloudflare   |
| `@pikku/pino`            | Structured logging via Pino        |
| `@pikku/pg`              | PostgreSQL connection              |
| `@pikku/kysely`          | Type-safe SQL via Kysely           |
| `@pikku/redis`           | Redis client                       |
| `@pikku/queue-bullmq`    | Job queues via BullMQ              |
| `@pikku/queue-pg-boss`   | Job queues via PgBoss              |
| `@pikku/aws-services`    | AWS SDK (SQS, DynamoDB, etc.)      |

## Key Differences from Traditional Frameworks

1. **No decorators** — plain functions + explicit wiring, not `@Get()` or `@Injectable()`
2. **No classes required** — everything is functions and objects
3. **Transport is configuration, not code** — business logic doesn't know about HTTP/WS/etc.
4. **One function, many transports** — same function can serve HTTP, WebSocket, queue, and MCP simultaneously
5. **Generated type safety** — clients are auto-generated with full types, not manually maintained
6. **Schema-first validation** — Standard Schema (Zod/Valibot) replaces class-validator decorators
