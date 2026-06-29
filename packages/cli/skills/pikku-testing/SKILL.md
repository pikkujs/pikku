---
name: pikku-testing
description: 'Use when writing tests for Pikku functions, middleware, permissions, or services. Covers unit testing with direct invocation, runPikkuFunc, service mocking, and integration testing with the HTTP runner.
TRIGGER when: user asks about testing, writing tests, test setup, mocking services, or integration testing Pikku functions.
DO NOT TRIGGER when: user asks about running the existing test suite (use Bash) or CI configuration (not a Pikku skill).'
installGroups: [core]
---

# Pikku Testing

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Pikku functions are pure business logic — no HTTP, no framework — making them easy to test. Test at three levels: direct function calls, `runPikkuFunc` (with middleware/permissions), and integration tests (full HTTP stack).

## Before You Start

```bash
pikku info functions --verbose   # existing functions + their middleware/permissions
pikku info middleware --verbose  # middleware applied
```

## Cucumber / BDD (feature files)

When writing `.feature` files, the golden rule: **never put JSON, inline tables, or raw values inside `.feature` files** — all test data goes in typed `PersonaData<T>` maps (from `@pikku/cucumber`) that step definitions look up by name. For personas, named domain data, the support file layout, and the full set of BDD anti-patterns, read `references/cucumber-bdd-testing.md`.

## Coverage-Driven Test Writing

When asked to improve or fill test coverage, start with the AI prompt from the coverage command:

```bash
pikku tests coverage --ai-out coverage-prompt.md     # run tests + emit AI-ready prompt of uncovered/partial functions
pikku tests coverage --no-run --ai-out coverage-prompt.md   # skip re-running, use existing coverage data
pikku tests coverage --ai-out -                      # pipe to stdout
```

The prompt lists each function needing work with status (`uncovered`/`partial`), coverage ratio, missed line numbers, and source path. Use it as your starting point:

1. Read the prompt to know which functions need Gherkin scenarios.
2. Run `pikku meta functions list` or `pikku meta context` to get input/output schemas for those functions.
3. Write `.feature` files under `tests/tests/features/` — one feature per domain, one scenario per case.
4. Re-run `pikku tests coverage` to confirm coverage improved.

See `pikku-concepts` for the core mental model.

## Test Runner Setup

Pikku uses the Node.js built-in test runner with tsx for TypeScript:

```bash
node --import tsx --test src/**/*.test.ts
```

```typescript
import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
```

A reusable mock logger / singleton services bag used throughout the examples below:

```typescript
const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
const mockSingletonServices = { logger: mockLogger /* + any services your funcs need */ } as any
```

## Level 1: Direct Function Invocation

The simplest approach — call `func` directly with mock services. Tests pure business logic: no middleware, permissions, or validation.

```typescript
import { describe, test } from 'node:test'
import assert from 'node:assert'

describe('createTodo', () => {
  test('should create a todo', async () => {
    const mockServices = {
      todoStore: { add: async (title: string) => ({ id: '1', title, completed: false }) },
    }
    const result = await createTodo.func(mockServices as any, { title: 'Buy milk' })
    assert.equal(result.title, 'Buy milk')
    assert.equal(result.completed, false)
  })
})
```

## Level 2: `runPikkuFunc` (Full Pipeline)

Tests the function through Pikku's middleware, permissions, and schema-validation pipeline. Always `resetPikkuState()` in `beforeEach`. Register function metadata into `pikkuState(null, 'function', 'meta')`, register the function with `addFunction`, then invoke with `runPikkuFunc`.

```typescript
import { runPikkuFunc, addFunction, addMiddleware, addPermission } from '@pikku/core'
import { resetPikkuState, pikkuState } from '@pikku/core'

beforeEach(() => resetPikkuState())

test('should run function with middleware', async () => {
  pikkuState(null, 'function', 'meta')['myFunc'] = {
    pikkuFuncId: 'myFunc', inputSchemaName: null, outputSchemaName: null,
  }
  addFunction('myFunc', {
    func: async (services, data) => ({ greeting: `Hello ${data.name}` }),
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

Middleware runs: wiring tags → wiring → func tags → func. Register tag middleware with `addMiddleware(tag, [...])`, reference func tags in the meta's `middleware: [{ type: 'tag', tag }]`, pass wiring middleware via `wireMiddleware` and inherited tags via `inheritedMiddleware`.

```typescript
test('middleware runs in order: wiring tags -> wiring -> func tags -> func', async () => {
  const order: string[] = []
  const createMiddleware =
    (name: string) => async (services: any, wire: any, next: Function) => {
      order.push(name); await next()
    }

  addMiddleware('apiTag', [createMiddleware('apiTag')])
  addMiddleware('funcTag', [createMiddleware('funcTag')])

  pikkuState(null, 'function', 'meta')['myFunc'] = {
    pikkuFuncId: 'myFunc', inputSchemaName: null, outputSchemaName: null,
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

  assert.deepEqual(order, ['apiTag', 'wiringMiddleware', 'funcTag', 'funcMiddleware', 'main'])
})
```

### Testing Permissions

Register a denying permission with `addPermission(tag, [...])` and reference it in the meta's `permissions`.

```typescript
test('should reject when permission fails', async () => {
  addPermission('admin', [async () => false]) // always deny

  pikkuState(null, 'function', 'meta')['adminFunc'] = {
    pikkuFuncId: 'adminFunc', inputSchemaName: null, outputSchemaName: null,
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

Test the full HTTP stack using the `fetch` export. Set singleton services and factories into state, register route metadata + function, then `wireHTTP`.

```typescript
import { fetch, wireHTTP } from '@pikku/core/http'
import { resetPikkuState, pikkuState, addFunction } from '@pikku/core'

const listTodos = { func: async () => ({ todos: [{ id: '1', title: 'Test todo' }] }) }

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices)
  pikkuState(null, 'package', 'factories', { createWireServices: async () => ({}) })
})

test('GET /todos returns todo list', async () => {
  pikkuState(null, 'http', 'meta')['get'] = pikkuState(null, 'http', 'meta')['get'] || {}
  pikkuState(null, 'http', 'meta')['get']['/todos'] = {
    pikkuFuncId: 'listTodos', method: 'get', route: '/todos',
  }
  addFunction('listTodos', listTodos)
  wireHTTP({ method: 'get', route: '/todos', func: listTodos })

  const response = await fetch(new Request('http://localhost/todos'))
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

For integration testing with a running server, build real services via `pikkuServices`/`pikkuWireServices` and bootstrap a server:

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

- **Mock logger / singleton services** — see the reusable bag defined under "Test Runner Setup".
- **Reset state between tests** — always `resetPikkuState()` in `beforeEach` to isolate tests.

```typescript
import { resetPikkuState } from '@pikku/core'
beforeEach(() => resetPikkuState())
```

- **Async error assertions**:

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
  func: async ({ todoStore }, { title }) => todoStore.add(title),
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
  async list() { return this.todos }
}

describe('createTodo', () => {
  let todoStore: MockTodoStore
  beforeEach(() => { todoStore = new MockTodoStore() })

  test('creates a todo with the given title', async () => {
    const result = await createTodo.func({ todoStore } as any, { title: 'Buy milk' })
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
