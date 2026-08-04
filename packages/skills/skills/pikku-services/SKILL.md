---
name: pikku-services
description: >-
  Use when setting up dependency injection, creating custom services, or configuring the service
  layer in a Pikku app. Covers pikkuServices (singleton), pikkuWireServices (per-request),
  pikkuServerLifecycle (startup/shutdown hooks), service typing, built-in services, and
  tree-shaking. TRIGGER when: code uses pikkuServices/pikkuWireServices/pikkuServerLifecycle, user
  asks about services.ts, lifecycle.ts, dependency injection, service factories, startup or
  shutdown work, or built-in services (ConsoleLogger, JoseJWTService). DO NOT TRIGGER when: user asks
  about middleware (use pikku-middleware), auth strategies or sessions (use pikku-security),
  permissions (use pikku-permissions), or secrets/variables (use pikku-config).
installGroups: [core]
---

# Pikku Services (Dependency Injection)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Pikku uses factory functions for dependency injection. Singleton services are created once at startup; wire services are created fresh per request/job/command. See `pikku-concepts` for the core mental model.

## Before You Start

```bash
pikku info functions --verbose   # See which services existing functions use
pikku info tags --verbose        # Understand project organization
```

## API Reference

### `pikkuServices(factory)` — singleton services (created once at startup)

```typescript
import { pikkuServices } from '#pikku'
import { ConsoleLogger } from '@pikku/core/services'
import { JoseJWTService } from '@pikku/jose'

export const createSingletonServices = pikkuServices(
  async (config, existingServices?) => {
    // config: your CoreConfig object
    // existingServices: optional, for chaining factories
    const logger = new ConsoleLogger()
    const database = new DatabasePool(config.database)
    await database.connect()
    const jwt = new JoseJWTService(
      async () => [{ id: 'my-key', value: config.jwtSecret }],
      logger
    )
    return { config, logger, database, jwt, books: new BookService() }
  }
)
```

### `pikkuWireServices(factory)` — per-request services (fresh per HTTP request, queue job, CLI command, etc.)

```typescript
import { pikkuWireServices } from '#pikku'

export const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => {
    // singletonServices: all singleton services
    // wire: transport context (session, channel, etc.)
    // Pikku merges these with singleton services automatically
    return {
      userSession: createUserSessionService(wire),
      dbTransaction: new DatabaseTransaction(singletonServices.database),
    }
  }
)
```

### `pikkuServerLifecycle(hooks)` — startup and shutdown work

A service factory should **construct** services, not run startup side effects. Seeding a database, warming a cache, starting a background consumer or draining a queue belongs in lifecycle hooks, which receive the singleton services after they are built:

```typescript
// src/lifecycle.ts
import { pikkuServerLifecycle } from '@pikku/core'
import type { SingletonServices } from '../types/application-types.js'

export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  beforeStart: async ({ kysely }) => {
    await runMigrations(kysely) // before the port opens
  },
  afterStart: async (services) => {
    await seedDevData(services) // server is accepting traffic
  },
  beforeStop: async ({ queueService }) => {
    await queueService.drain() // services are still alive here
  },
  afterStop: async () => {
    await releaseExternalLock() // services are ALREADY stopped
  },
})
```

Every hook is optional. Order is `beforeStart` → server starts → `afterStart`, then on SIGINT `beforeStop` → services stopped → server stopped → `afterStop`.

**`afterStop` runs after the singleton services have been stopped.** It still receives the services object, but the services inside it are shut down — using one there is a use-after-close bug. Anything that needs a live service goes in `beforeStop`.

Export **exactly one** `pikkuServerLifecycle` from anywhere in `srcDirectories`; the inspector finds it by the wrapper call, so the filename is free (`src/lifecycle.ts` by convention). It must be an exported `const` initialized with a direct call to `pikkuServerLifecycle` — a re-export or a conditional wrapper is invisible to the inspector.

**Only `pikku dev` and `pikku serve` run these hooks.** If you bootstrap your own server (Express, Fastify, uWS, Lambda, Cloudflare, Next.js), no runtime adapter invokes them — put the work in your entrypoint instead.

### Auto-Generated Service Manifest

After `npx pikku all`, Pikku generates `.pikku/pikku-services.gen.ts`, a manifest of which services are actually used by wired functions:

```typescript
export const requiredSingletonServices = {
  database: true, // used by getUser, deleteUser
  audit: true, // used by deleteUser
  cache: false, // not used by any wired function
  jwt: true, // used by auth middleware
} as const

export type RequiredSingletonServices = Pick<
  SingletonServices,
  'database' | 'audit' | 'jwt'
> &
  Partial<Omit<SingletonServices, 'database' | 'audit' | 'jwt'>>
```

## Usage Patterns

### Using Services in Functions

**Every service must be declared in `SingletonServices` (or `Services`) in `application-types.d.ts`.** Never access a service via a body-level cast (`services as typeof services & { myService: MyService }`) — that means the type is missing. Add the import and the field to `SingletonServices`, then destructure inline in the function signature. The inspector emits `SERVICES_NOT_DESTRUCTURED` (`PKU410`) and tree-shaking breaks when the first param is a plain identifier rather than an object pattern. Never `new` a service inside a function — services arrive only via injection.

```typescript
// ✅ Correct — inline destructure, no cast
const getUser = pikkuFunc({
  title: 'Get User',
  func: async ({ db, logger, jwt }, { userId }) => {
    logger.info('Fetching user', { userId })
    return { user: await db.getUser(userId) }
  },
})

// ❌ Wrong — named param + body cast; inspector warns + tree-shaking breaks
const getUser = pikkuFunc({
  func: async (services, { userId }) => {
    const { db } = services as typeof services & { db: DbService }
    // ...
  },
})
```

### Services Are Never Optional Inside a Function

**Never write a `if (!service) throw ...` existence guard in a function body.** It is dead code, and it defeats the platform.

Optionality lives in exactly one place — `services.ts` / the `SingletonServices` declaration — and it means *"this may not be created"*, not *"this may be missing at call time"*. A service is optional precisely because **nothing destructures it**, and the generated `requiredSingletonServices` manifest therefore never marks it for creation. The moment any wired function destructures it, Pikku creates it and guarantees it is there.

The types enforce this rather than merely documenting it. The inspector records the services destructured by every wired `func`, `permissions` **and** `middleware`, and emits them as `RequiredSingletonServices`. The generated function types then default their service parameter to:

```typescript
export type WiredSingletonServices = RequiredSingletonServices & SingletonServices
export type WiredServices = SecretlessServices<RequiredSingletonServices & Services>
```

The `SecretlessServices<...>` wrapper is why `secrets` never appears in a
function's services: it is stripped at the type level, not merely omitted by
convention. Read secrets in a service factory or middleware and hand the value
to a service instead.

so a service that is `foo?: Foo` in `SingletonServices` arrives as a non-optional `Foo` in every function, permission and middleware that uses it. There is nothing to guard against.

```typescript
// ✅ Correct — destructure and use; creation is guaranteed by the manifest
const listThreads = pikkuFunc({
  func: async ({ agentRunService }, { threadId }) => {
    return await agentRunService.getThreadMessages(threadId)
  },
})

// ❌ Wrong — unreachable guard; signals a misunderstanding of service wiring
const listThreads = pikkuFunc({
  func: async ({ agentRunService }, { threadId }) => {
    if (!agentRunService) throw new MissingServiceError('agentRunService')
    return await agentRunService.getThreadMessages(threadId)
  },
})
```

If a service really is conditional at runtime (e.g. an optional integration a deployment may not configure), that is a **configuration** concern: branch on config, or fail fast at startup in `services.ts` — not per-request in every function.

### Dynamic Import Optimization

Use the generated manifest to conditionally import heavy dependencies — only the services actually wired get instantiated:

```typescript
import { requiredSingletonServices } from '.pikku/pikku-services.gen.js'

const createSingletonServices = pikkuServices(async (config) => {
  const logger = new ConsoleLogger()

  let jwt: JWTService | undefined
  if (requiredSingletonServices.jwt) {
    const { JoseJWTService } = await import('@pikku/jose')
    jwt = new JoseJWTService(keys, logger)
  }

  let database: Database | undefined
  if (requiredSingletonServices.database) {
    database = await createDatabase(config.databaseUrl)
  }

  return { config, logger, jwt, database }
})
```

### Audit Wire Service

`createInvocationAudit` + `createAuditedKysely` add per-request audit buffering that flushes on request close (no-op if `audit` is unconfigured). For the full pattern, no-op behavior, custom-event usage, and Fabric notes, read `references/audit-wire-service.md`.

### Built-in Services

| Service                    | Package                | Purpose                          |
| -------------------------- | ---------------------- | -------------------------------- |
| `ConsoleLogger`            | `@pikku/core/services` | Console-based logging            |
| `JoseJWTService`           | `@pikku/jose`          | JWT sign/verify via jose         |
| `LocalSecretService`       | `@pikku/core/services` | Local development secrets        |
| `LocalVariablesService`    | `@pikku/core/services` | Local environment variables      |
| `PinoLogger`               | `@pikku/pino`          | Structured logging via Pino      |
| `createInvocationAudit`    | `@pikku/core/services` | Per-request audit buffer         |
| `createAuditedKysely`      | `@pikku/kysely`        | Auto-capture DB queries as audit events |

## Complete Example

```typescript
// services.ts
import { pikkuServices, pikkuWireServices } from '#pikku'
import { ConsoleLogger } from '@pikku/core/services'
import { JoseJWTService } from '@pikku/jose'

// Custom service
class TodoStore {
  private todos: Map<string, Todo> = new Map()
  async create(title: string, priority: string) {
    const todo = { id: crypto.randomUUID(), title, priority, completed: false }
    this.todos.set(todo.id, todo)
    return todo
  }
  async get(id: string) { return this.todos.get(id) }
  async list() { return [...this.todos.values()] }
  async delete(id: string) { this.todos.delete(id) }
}

export const createSingletonServices = pikkuServices(async (config) => {
  const logger = new ConsoleLogger()
  const jwt = new JoseJWTService(
    async () => [{ id: 'my-key', value: config.jwtSecret }],
    logger
  )
  return {
    config,
    logger,
    jwt,
    secrets: new LocalSecretService(),
    variables: new LocalVariablesService(),
    todoStore: new TodoStore(),
  }
})

export const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => ({
    scopedLogger: new ScopedLogger(wire.session?.userId),
  })
)

// functions/todos.functions.ts — services are auto-injected
export const createTodo = pikkuFunc({
  title: 'Create Todo',
  func: async ({ todoStore, logger }, { title, priority }) => {
    const todo = await todoStore.create(title, priority)
    logger.info('Created todo', { id: todo.id })
    return { todo }
  },
})
```
