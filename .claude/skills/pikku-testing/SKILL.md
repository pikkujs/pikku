---
name: pikku-testing
description: 'Use when writing tests for Pikku functions, middleware, permissions, or services. Covers unit testing with direct invocation, runPikkuFunc, service mocking, and integration testing with the HTTP runner.'
---

# Pikku Testing

Pikku functions are pure business logic — no HTTP, no framework — making them easy to test. Test at three levels: direct function calls, `runPikkuFunc` (with middleware/permissions), and integration tests (full HTTP stack).

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and their middleware/permissions
pikku info middleware --verbose  # See middleware applied
```

See `pikku-concepts` for the core mental model.

## Test Runner Setup

Pikku uses Node.js built-in test runner with tsx for TypeScript:

```bash
node --import tsx --test src/**/*.test.ts
```

Standard test file:

```typescript
import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
```

## Level 1: Direct Function Invocation

The simplest approach — call `func` directly with mock services:

```typescript
import { describe, test } from 'node:test'
import assert from 'node:assert'

describe('createTodo', () => {
  test('should create a todo', async () => {
    const mockServices = {
      todoStore: {
        add: async (title: string) => ({
          id: '1',
          title,
          completed: false,
        }),
      },
    }

    const result = await createTodo.func(
      mockServices as any,
      { title: 'Buy milk' }
    )

    assert.equal(result.title, 'Buy milk')
    assert.equal(result.completed, false)
  })
})
```

This tests pure business logic — no middleware, no permissions, no validation.

## Level 2: `runPikkuFunc` (Full Pipeline)

Tests the function through Pikku's middleware, permissions, and schema validation pipeline:

```typescript
import { runPikkuFunc } from '@pikku/core'
import { addFunction, addMiddleware, addPermission } from '@pikku/core'
import { resetPikkuState, pikkuState } from '@pikku/core'

beforeEach(() => {
  resetPikkuState()
})

test('should run function with middleware', async () => {
  const mockSingletonServices = {
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  } as any

  // Register function metadata
  pikkuState(null, 'function', 'meta')['myFunc'] = {
    pikkuFuncId: 'myFunc',
    inputSchemaName: null,
    outputSchemaName: null,
  }

  // Register the function
  addFunction('myFunc', {
    func: async (services, data) => {
      return { greeting: `Hello ${data.name}` }
    },
  })

  const result = await runPikkuFunc('rpc', 'test-wire', 'myFunc', {
    singletonServices: mockSingletonServices,
    getAllServices: () => mockSingletonServices,
    data: () => ({ name: 'World' }),
    auth: false,
    wire: {},
  })

  assert.deepEqual(result, { greeting: 'Hello World' })
})
```

### Testing Middleware Execution Order

```typescript
test('middleware runs in order: wiring tags -> wiring -> func tags -> func', async () => {
  const order: string[] = []

  const createMiddleware = (name: string) =>
    async (services: any, wire: any, next: Function) => {
      order.push(name)
      await next()
    }

  addMiddleware('apiTag', [createMiddleware('apiTag')])
  addMiddleware('funcTag', [createMiddleware('funcTag')])

  pikkuState(null, 'function', 'meta')['myFunc'] = {
    pikkuFuncId: 'myFunc',
    inputSchemaName: null,
    outputSchemaName: null,
    middleware: [{ type: 'tag', tag: 'funcTag' }],
  }

  addFunction('myFunc', {
    func: async () => { order.push('main'); return 'ok' },
    middleware: [createMiddleware('funcMiddleware')],
    tags: ['funcTag'],
  })

  await runPikkuFunc('rpc', 'test', 'myFunc', {
    singletonServices: mockSingletonServices,
    getAllServices: () => mockSingletonServices,
    data: () => ({}),
    wireMiddleware: [createMiddleware('wiringMiddleware')],
    inheritedMiddleware: [{ type: 'tag', tag: 'apiTag' }],
    auth: false,
    wire: {},
  })

  assert.deepEqual(order, [
    'apiTag',
    'wiringMiddleware',
    'funcTag',
    'funcMiddleware',
    'main',
  ])
})
```

### Testing Permissions

```typescript
test('should reject when permission fails', async () => {
  addPermission('admin', [
    async () => false,  // Always deny
  ])

  pikkuState(null, 'function', 'meta')['adminFunc'] = {
    pikkuFuncId: 'adminFunc',
    inputSchemaName: null,
    outputSchemaName: null,
    permissions: [{ type: 'tag', tag: 'admin' }],
  }

  addFunction('adminFunc', { func: async () => 'secret' })

  await assert.rejects(
    runPikkuFunc('rpc', 'test', 'adminFunc', {
      singletonServices: mockSingletonServices,
      getAllServices: () => mockSingletonServices,
      data: () => ({}),
      auth: false,
      wire: {},
    }),
    /Permission/
  )
})
```

## Level 3: Integration Testing (HTTP)

Test the full HTTP stack using the `fetch` export:

```typescript
import { fetch, wireHTTP } from '@pikku/core/http'
import { resetPikkuState, pikkuState } from '@pikku/core'

beforeEach(() => {
  resetPikkuState()

  // Set up singleton services in state
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices)
  pikkuState(null, 'package', 'factories', { createWireServices: async () => ({}) })
})

test('GET /todos returns todo list', async () => {
  // Register route and function...
  wireHTTP({ method: 'get', route: '/todos', func: listTodos })

  const request = new Request('http://localhost/todos')
  const response = await fetch(request)
  const data = await response.json()

  assert.equal(response.status, 200)
  assert.ok(Array.isArray(data.todos))
})
```

## Testing Services

Test custom services in isolation:

```typescript
import { describe, test } from 'node:test'
import assert from 'node:assert'
import { LocalVariablesService } from '@pikku/core/services'

describe('LocalVariablesService', () => {
  test('should get and set variables', () => {
    const service = new LocalVariablesService({ API_KEY: 'test-key' })
    assert.equal(service.get('API_KEY'), 'test-key')

    service.set('NEW_KEY', 'value')
    assert.equal(service.get('NEW_KEY'), 'value')
  })
})
```

## Testing with Real Services (Verifier Pattern)

For integration testing with a running server:

```typescript
// services.ts — real service setup for tests
import { pikkuServices, pikkuWireServices } from '#pikku'
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'

export const createSingletonServices = pikkuServices(async (config) => {
  const variables = new LocalVariablesService()
  const secrets = new LocalSecretService(variables)
  return { config, variables, secrets, logger: new ConsoleLogger() }
})

export const createWireServices = pikkuWireServices(async () => ({}))
```

```typescript
// start.ts — bootstrap server for tests
import './.pikku/pikku-bootstrap.gen.js'
import { createSingletonServices, createWireServices } from './services.js'

const config = {}
const singletonServices = await createSingletonServices(config)
const server = new PikkuFastifyServer(config, singletonServices, createWireServices)
await server.init()
await server.start()
```

## Common Patterns

### Mock Logger

```typescript
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}
```

### Mock Singleton Services

```typescript
const mockSingletonServices = {
  logger: mockLogger,
  todoStore: new InMemoryTodoStore(),
  // Add whatever services your functions need
} as any
```

### Reset State Between Tests

Always reset pikku state in `beforeEach` to isolate tests:

```typescript
import { resetPikkuState } from '@pikku/core'

beforeEach(() => {
  resetPikkuState()
})
```

### Async Error Assertions

```typescript
await assert.rejects(
  async () => await myFunc.func(services, { id: 'nonexistent' }),
  { message: 'Not found' }
)
```

## Complete Example

```typescript
// functions/todos.functions.ts
export const createTodo = pikkuSessionlessFunc({
  description: 'Create a todo',
  input: z.object({ title: z.string().min(1) }),
  output: z.object({ id: z.string(), title: z.string() }),
  func: async ({ todoStore }, { title }) => {
    return todoStore.add(title)
  },
})

// functions/todos.test.ts
import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'

class MockTodoStore {
  private todos: any[] = []

  async add(title: string) {
    const todo = { id: String(this.todos.length + 1), title, completed: false }
    this.todos.push(todo)
    return todo
  }

  async list() {
    return this.todos
  }
}

describe('createTodo', () => {
  let todoStore: MockTodoStore

  beforeEach(() => {
    todoStore = new MockTodoStore()
  })

  test('creates a todo with the given title', async () => {
    const result = await createTodo.func(
      { todoStore } as any,
      { title: 'Buy milk' }
    )

    assert.equal(result.id, '1')
    assert.equal(result.title, 'Buy milk')
  })

  test('increments IDs', async () => {
    await createTodo.func({ todoStore } as any, { title: 'First' })
    const second = await createTodo.func({ todoStore } as any, { title: 'Second' })

    assert.equal(second.id, '2')
  })
})
```
