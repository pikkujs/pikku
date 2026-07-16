---
name: pikku-services
description: 'Use when setting up dependency injection, creating custom services, or configuring the service layer in a Pikku app. Covers pikkuServices (singleton), pikkuWireServices (per-request), service typing, built-in services, and tree-shaking.
TRIGGER when: code uses pikkuServices/pikkuWireServices, user asks about services.ts, dependency injection, service factories, or built-in services (ConsoleLogger, JoseJWTService).
DO NOT TRIGGER when: user asks about auth middleware (use pikku-security) or secrets/variables (use pikku-config).'
installGroups: [core]
---

# Pikku Services (Dependency Injection)

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
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

**Every service must be declared in `SingletonServices` (or `Services`) in `application-types.d.ts`.** Never access a service via a body-level cast (`services as typeof services & { myService: MyService }`) — that means the type is missing. Add the import and the field to `SingletonServices`, then destructure inline in the function signature. The inspector emits `SERVICES_NOT_DESTRUCTURED` and tree-shaking breaks when the first param is a plain identifier rather than an object pattern. Never `new` a service inside a function — services arrive only via injection.

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
    scopedLogger: new ScopedLogger(wire.session?.initial?.userId),
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
