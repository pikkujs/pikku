---
name: pikku-concepts
description: >-
  Foundational guide to Pikku framework concepts. Use this skill when working with any Pikku
  codebase, starting a new Pikku project, or migrating a backend to Pikku. Covers the core mental
  model, function types, project structure, code generation, testing, and how Pikku maps to
  traditional backend patterns. TRIGGER when: user asks "what is Pikku?", starts a new Pikku
  project, migrates from Express/NestJS/Hono, or needs to understand how Pikku works. DO NOT
  TRIGGER when: user is doing a specific wiring task (use the specific skill instead, e.g.
  pikku-http, pikku-websocket).
installGroups: [core]
---

# Pikku Framework Concepts

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Pikku is a TypeScript framework that separates business logic from transport mechanisms. You define a function once, then wire it to HTTP, WebSocket, queues, schedulers, MCP, CLI, or RPC — without the function knowing how it's being called.

For deep-dive on each topic, see the dedicated skills:

- **Wiring**: `pikku-http`, `pikku-websocket`, `pikku-rpc`, `pikku-mcp`, `pikku-queue`, `pikku-cron`, `pikku-trigger`, `pikku-cli`, `pikku-ai-agent`, `pikku-workflow`
- **Authorization**: `pikku-security` (authentication/sessions), `pikku-permissions` (permission checks, scopes), `pikku-middleware` (global/tag/route middleware)
- **Infrastructure**: `pikku-services`, `pikku-config`
- **Project introspection**: `pikku-info`

## Core Mental Model

```text
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

Controllers/routes → `pikkuFunc`; auth/sessions → `pikku-security`; authorization checks → `pikku-permissions`; request interception → `pikku-middleware`; DI → `pikku-services`; transports (HTTP/WS/queue/cron) → their `wire*` + skill. For the full Generic Backend → Pikku mapping table (with side-by-side code examples), read `references/concept-mapping.md`.

## Functions

Three main function types:

```typescript
// Requires authentication — receives session in wire context.
// input/output are Zod schemas; the data + return types are inferred from them.
const updateTodo = pikkuFunc({
  input: UpdateTodoInput,
  output: TodoOutput,
  func: async (services, data, wire) => {
    const { session } = wire
    return services.todoStore.update(data.id, data)
  },
})

// No authentication required
const listTodos = pikkuSessionlessFunc({
  input: ListTodosInput,
  output: TodoListOutput,
  func: async (services, data) => {
    return { todos: services.todoStore.list(data.filters) }
  },
})

// No input or output (for scheduled tasks, lifecycle hooks)
const cleanup = pikkuVoidFunc(async (services) => {
  services.todoStore.cleanOldItems()
})
```

Services can be destructured inline in the `func` signature (e.g. `async ({ logger, todoStore }, { title }) => ...`). Full config options:

```typescript
pikkuFunc({
  // Identity and documentation
  title?: string,           // Human-readable name
  description?: string,     // What the function does
  version?: number,         // Contract version (see pikku-versioning)
  override?: string,        // Logical name override, so several exports share a versioned base
  tags?: string[],          // For grouping and middleware targeting

  // Contract
  input?: ZodSchema,        // Input validation schema
  output?: ZodSchema,       // Output validation schema
  errors?: Array<typeof PikkuError>,  // Errors this function may throw

  // Reachability
  expose?: boolean,         // Allow external RPC calls (see pikku-rpc)
  remote?: boolean,         // Allow remote RPC calls
  mcp?: boolean,            // Expose as MCP tool (see pikku-mcp)
  readonly?: boolean,       // Declares the function performs no writes
  deploy?: 'serverless' | 'server' | 'auto',

  // Authorization — see pikku-permissions
  auth?: boolean,           // Override default auth requirement
  scopes?: ScopeId[],       // AND-ed, checked before permissions; session required
  permissions?: PermissionGroup,  // OR-ed pool
  permissionsInBody?: boolean,    // Last resort; needs allow.permissionsInBody in config
  middleware?: PikkuMiddleware[], // See pikku-middleware

  // Agent tooling — see pikku-ai-agent
  approvalRequired?: boolean,
  approvalDescription?: (services, data) => Promise<string>,

  // Workflow step behavior — see pikku-workflow
  workflowQueued?: boolean, // Dispatch via queue instead of inline
  workflowRetries?: number,
  workflowTimeout?: string, // e.g. '30s', '5m'

  audit?: boolean | { durability?: 'best-effort' | 'transactional' },

  func: async (services, data, wire) => { ... },
})
```

`scopes` is the one option `pikkuSessionlessFunc` does not accept, and the
omission is deliberate: scopes are AND-ed and fail closed, so an anonymous
caller holds none and satisfies none — a sessionless function with scopes would
reject every caller it exists to serve. Gate those with `permissions`, which
receive the optional session and may pass anonymous.

**Generics XOR `input`/`output` — never both.** A function's data and return
types come from *one* source: either the `input`/`output` schemas (preferred —
they double as runtime validation and OpenAPI) or type generics
(`pikkuFunc<In, Out>({ ... })`). Passing both makes the two disagree and forces
`as any` casts. Do not annotate the `func` return type inline either — let the
`output` schema (or the generic) be the single source of truth for the type.

```typescript
// Correct — schema-based (no generics, no inline return type)
pikkuFunc({ input: MyInput, output: MyOutput, func: async (s, d) => { ... } })
// Correct — generic-based (no input/output)
pikkuFunc<MyIn, MyOut>({ func: async (s, d) => { ... } })
// WRONG — mixing the two
pikkuFunc<MyIn, MyOut>({ input: MyInput as any, func: async (s, d) => { ... } })
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

There are two ways to start a Pikku app. Pick based on whether you need to own the HTTP server.

**1. Let Pikku own the server (preferred when you don't need a specific runtime)**

`pikku dev` and `pikku serve` create the config and singleton services, start the server, and shut it down cleanly. You write no bootstrap code at all — startup and shutdown work goes in lifecycle hooks:

```typescript
// src/lifecycle.ts
import { pikkuServerLifecycle } from '@pikku/core'
import type { SingletonServices } from '../types/application-types.js'

export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  beforeStart: async ({ kysely }) => {
    await runMigrations(kysely)
  },
  afterStart: async ({ logger }) => {
    logger.info('accepting traffic')
  },
  beforeStop: async ({ queueService }) => {
    await queueService.drain()
  },
})
```

Export exactly one `pikkuServerLifecycle` from anywhere in `srcDirectories` — the inspector finds it by the wrapper call. Every hook is optional and receives the already-created singleton services. See pikku-services for the ordering and the `afterStop` caveat.

**2. Bootstrap it yourself (required for a specific runtime)**

Express, Fastify, uWS, Lambda, Cloudflare and Next.js need their own entrypoint, because Pikku is embedded in a server you own:

```typescript
import '../../functions/.pikku/pikku-bootstrap.gen.js' // Generated — registers all wirings

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

// Pick your runtime:
const server = new PikkuFastifyServer(
  config,
  singletonServices,
  createWireServices
)
// or: new PikkuExpressServer(config, singletonServices, createWireServices)
// or: pikkuAWSLambdaHandler(singletonServices)
// or: PikkuCloudflareHandler(singletonServices)
// or: pikkuNextHandler(singletonServices)

await server.init()
await server.start()
```

**Lifecycle hooks do not run on this path** — only `pikku dev` and `pikku serve` invoke them. Do your startup work directly in the entrypoint instead.

`pikku validate` warns when a project starts a server by hand *and* depends on no runtime adapter, since that combination means path 1 was available and unused. Silence it with `"lint": { "customServerBootstrap": "off" }` in `pikku.config.json`.

## Code Generation

Run `npx pikku all` to generate:

- `pikku-types.gen.ts` — Typed function factories and wiring functions
- `pikku-fetch.gen.ts` — Type-safe HTTP client
- `pikku-websocket.gen.ts` — Type-safe WebSocket client
- `pikku-bootstrap.gen.ts` — Runtime initialization (auto-imports all wirings)
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

```text
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
├── lifecycle.ts         # Server lifecycle hooks (pikku dev/serve only)
├── middleware.ts         # Middleware definitions (see pikku-security)
├── permissions.ts       # Permission definitions (see pikku-security)
└── .pikku/              # Generated (gitignored)
    ├── pikku-types.gen.ts
    ├── pikku-fetch.gen.ts
    └── pikku-bootstrap.gen.ts
```

## Environment Variables

Never use `process.env` inside Pikku functions. Use the `variables` service (see `pikku-config`):

```typescript
const apiKey = services.variables.get('API_KEY')
```

`process.env` belongs in server bootstrap code (`start.ts`) only.

## Secrets

`secrets` is not part of a function's services. It is available only in
`pikkuServices`, `pikkuWireServices`, addon service factories and middleware —
read it there, give the value to a service, and have the function ask that
service. Reaching for it through a cast throws at runtime.

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

Pikku ships runtime adapters (`@pikku/express-server`, `@pikku/fastify-server`, `@pikku/next`, `@pikku/aws-lambda`, `@pikku/cloudflare`, `@pikku/uws-server`, `@pikku/modelcontextprotocol`, ...) and service packages (`@pikku/jose`, `@pikku/schema-ajv`, `@pikku/pino`, `@pikku/kysely`, `@pikku/redis`, `@pikku/queue-bullmq`, `@pikku/queue-pg-boss`, ...). For the full list with use cases, read `references/packages.md`.

## Key Differences from Traditional Frameworks

1. **No decorators** — plain functions + explicit wiring, not `@Get()` or `@Injectable()`
2. **No classes required** — everything is functions and objects
3. **Transport is configuration, not code** — business logic doesn't know about HTTP/WS/etc.
4. **One function, many transports** — same function can serve HTTP, WebSocket, queue, and MCP simultaneously
5. **Generated type safety** — clients are auto-generated with full types, not manually maintained
6. **Schema-first validation** — Standard Schema (Zod/Valibot) replaces class-validator decorators
