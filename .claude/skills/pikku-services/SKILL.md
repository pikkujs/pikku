---
name: pikku-services
description: "Use when setting up dependency injection, creating custom services, or configuring the service layer in a Pikku app. Covers pikkuServices (singleton), pikkuWireServices (per-request), service typing, built-in services, and tree-shaking."
---

# Pikku Services (Dependency Injection)

Pikku uses factory functions for dependency injection. Singleton services are created once at startup. Wire services are created fresh per request/job/command.

## Before You Start

```bash
pikku info functions --verbose   # See which services existing functions use
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `pikkuServices(factory)`

Create singleton services — instantiated once at server startup.

```typescript
import { pikkuServices } from '#pikku'

const createSingletonServices = pikkuServices(
  async (config, existingServices?) => {
    // config: your CoreConfig object
    // existingServices: optional, for chaining factories
    return {
      config,
      logger: Logger,
      jwt: JWTService,
      database: DatabasePool,
      // ...any custom services
    }
  }
)
```

### `pikkuWireServices(factory)`

Create per-request services — fresh instance for each HTTP request, queue job, CLI command, etc.

```typescript
import { pikkuWireServices } from '#pikku'

const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => {
    // singletonServices: all singleton services
    // wire: transport context (session, channel, etc.)
    // Pikku merges these with singleton services automatically
    return {
      userSession: UserSessionService,
      dbTransaction: DatabaseTransaction,
    }
  }
)
```

### Auto-Generated Service Manifest

After `npx pikku prebuild`, Pikku generates a manifest of which services are actually used:

```typescript
// .pikku/pikku-services.gen.ts (auto-generated)
export const requiredSingletonServices = {
  'database': true,     // used by getUser, deleteUser
  'audit': true,        // used by deleteUser
  'cache': false,       // not used by any wired function
  'jwt': true,          // used by auth middleware
} as const

export type RequiredSingletonServices =
  Pick<SingletonServices, 'database' | 'audit' | 'jwt'>
  & Partial<Omit<SingletonServices, 'database' | 'audit' | 'jwt'>>
```

## Usage Patterns

### Basic Singleton Services

```typescript
const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const logger = new ConsoleLogger()
    const database = new DatabasePool(config.database)
    await database.connect()

    const jwt = new JoseJWTService(
      async () => [{ id: 'my-key', value: JWT_SECRET }],
      logger
    )

    return {
      config,
      logger,
      database,
      jwt,
      books: new BookService(),
    }
  }
)
```

### Per-Request Wire Services

```typescript
const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => {
    return {
      userSession: createUserSessionService(wire),
      dbTransaction: new DatabaseTransaction(
        singletonServices.database
      ),
    }
  }
)
```

### Using Services in Functions

Functions destructure services from the first parameter:

```typescript
const getUser = pikkuFunc({
  title: 'Get User',
  func: async ({ db, logger, jwt }, { userId }) => {
    logger.info('Fetching user', { userId })
    const user = await db.getUser(userId)
    return { user }
  },
})
```

### Dynamic Import Optimization

Use the generated manifest to conditionally import heavy dependencies:

```typescript
import { requiredSingletonServices } from '.pikku/pikku-services.gen.js'

const createSingletonServices = pikkuServices(
  async (config) => {
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
  }
)
```

### Built-in Services

| Service | Package | Purpose |
|---------|---------|---------|
| `ConsoleLogger` | `@pikku/core` | Console-based logging |
| `JoseJWTService` | `@pikku/jose` | JWT sign/verify via jose |
| `LocalSecretService` | `@pikku/core` | Local development secrets |
| `LocalVariablesService` | `@pikku/core` | Local environment variables |
| `PinoLogger` | `@pikku/pino` | Structured logging via Pino |

## Complete Example

```typescript
// services.ts
import { pikkuServices, pikkuWireServices } from '#pikku'
import { ConsoleLogger } from '@pikku/core'
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

export const createSingletonServices = pikkuServices(
  async (config) => {
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
  }
)

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
