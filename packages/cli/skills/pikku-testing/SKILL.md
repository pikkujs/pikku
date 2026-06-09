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
pikku info functions --verbose   # See existing functions and their middleware/permissions
pikku info middleware --verbose  # See middleware applied
```

## Personas and Named Data — Never Inline JSON

**Never put JSON, inline tables, or raw values inside `.feature` files.** Feature files are for human-readable scenarios. All test data belongs in typed maps that step definitions look up by name.

`@pikku/cucumber` exports `PersonaData<T>` for this purpose — a typed map that throws a clear error when a name is missing.

### Personas

A **persona** is a named user: their login credentials plus the session they hold after authenticating. Define all personas in one file:

```ts
// tests/tests/support/personas.ts
import { PersonaData } from '@pikku/cucumber'

export const logins = new PersonaData({
  yasser: { email: 'yasser@example.com', password: 'hunter2' },
  guest:  { email: 'guest@example.com',  password: 'guest123' },
})
```

A persona step logs in and stores the session in the world so every subsequent call by that persona carries it automatically:

```ts
// tests/tests/support/steps/auth.steps.ts
import { Given } from '@cucumber/cucumber'
import { logins } from '../personas.js'

Given('{string} logs in', async function (name: string) {
  await this.call(name, 'auth:login', logins.get(name))
  const { token } = this.lastResult as { token: string }
  this.setSession(name, { token })
})
```

### Named Domain Data

Use a separate `PersonaData` map for each domain concept. Name entries after real-world meaning, not technical fields:

```ts
// tests/tests/support/data/cards.ts
import { PersonaData } from '@pikku/cucumber'

export const cards = new PersonaData({
  'writing a blog post': { title: 'Writing a blog post', columnId: 'backlog' },
  'fix the login bug':   { title: 'Fix the login bug',   columnId: 'in-progress' },
})
```

Steps resolve the name and make the call — the feature file never sees raw data:

```ts
// tests/tests/support/steps/card.steps.ts
import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { cards } from '../data/cards.js'

When('{string} creates a card for {string}', async function (persona: string, cardName: string) {
  await this.call(persona, 'kanban:createCard', cards.get(cardName))
})

When('{string} gets the card {string}', async function (persona: string, cardName: string) {
  const { title } = cards.get(cardName)
  await this.call(persona, 'kanban:getCard', { title })
})

// "the newly created card" — checks the live result against the data map entry
// AND any server-assigned fields (id, createdAt) are present
Then('the result is the newly created card {string}', function (cardName: string) {
  const expected = cards.get(cardName)
  const result = this.lastResult as typeof expected & { id: string; createdAt: string }
  assert.equal(result.title, expected.title)
  assert.equal(result.columnId, expected.columnId)
  assert.ok(result.id, 'expected server-assigned id')
  assert.ok(result.createdAt, 'expected server-assigned createdAt')
})
```

The feature file reads naturally:

```gherkin
Feature: Card management

  Scenario: Create and retrieve a card
    Given 'yasser' logs in
    When 'yasser' creates a card for 'writing a blog post'
    And 'yasser' gets the card 'writing a blog post'
    Then the result is the newly created card 'writing a blog post'
```

### File layout

```
tests/tests/support/
  personas.ts          ← logins PersonaData (one per project)
  data/
    cards.ts           ← cards PersonaData
    users.ts           ← users PersonaData
  steps/
    auth.steps.ts      ← login / logout steps
    card.steps.ts      ← card CRUD steps
```

Keep one `PersonaData` instance per domain concept. Steps import only what they need — no cross-domain coupling.

## @pikku/cucumber: RPC-first Testing Philosophy

**Default to `{actor} calls "functionName"`** for all endpoint tests. Only use wire-level steps when the wire itself adds behavior.

### How `{actor} calls "functionName"` works

By default, `{actor} calls "rpcName"` runs **in-process** — it calls the function directly through the pikku RPC pipeline (schema validation → middleware → permissions → function body), with the actor's headers injected into the stub HTTP wire. No server process is required.

Add a `@server` tag to a feature or scenario to switch to **HTTP mode** — the actor sends a real HTTP POST to `/BASE_URL/rpc/{rpcName}`. The server must be running in HTTP mode.

```gherkin
# Default: in-process (fast, no server required)
Feature: Builder auth
  Scenario: Anonymous cannot call a protected function
    When anonymous calls "getSandboxGitStatus"
    Then the call fails because they are unauthorized

# @server: real HTTP to the running server
@server
Feature: HTTP wire
  Scenario: Health check is reachable
    When anonymous makes a "get" request to "/health-check"
    Then the response status is 200
```

The actor owns the dispatch — `Actor.call(ctx, rpc, data)` checks the `@server` tag on the world context and routes accordingly. In-process mode injects `actor.headers` (including `Authorization: Bearer ...`) into the stub HTTP wire so auth middleware receives the token.

| Step | Mode | What it does |
|---|---|---|
| `{actor} calls "functionName"` | in-process (default) | Full RPC pipeline, no HTTP hop |
| `{actor} calls "functionName"` | HTTP (with `@server`) | POST to `/rpc/functionName` on live server |
| `{actor} makes a "get" request to "/path"` | HTTP always | Named-route test — for route-specific behavior |

### RPC vs wire: the decision rule

Before writing a wire-level test (`makes a "method" request to "/path"`), check whether the route adds anything beyond calling the function:

- No extra middleware or transforms → just use `{actor} calls "functionName"` (in-process)
- Route has specific behavior (URL-param routing, route-specific middleware, status codes) → write a `@server` wire test for those behaviors; an in-process RPC test for the function logic

```gherkin
# Wrong — testing rpcCaller behavior that adds nothing over the direct RPC call
When userA makes a "post" request to "/rpc/listTodos"
Then the response status is 200

# Right — test the function directly in-process; only use a @server route test if the route does something extra
When userA calls "listTodos"
Then the call succeeds
```

### Feature descriptions

Every feature file must have a description — free text after the `Feature:` line, before the first scenario. Describe what system behavior the feature covers and any non-obvious constraints. This is the place for context that would otherwise end up as inline comments scattered through scenarios.

```gherkin
Feature: Builder-auth RPC endpoints
  All builder-protected functions check the Authorization header via
  assertBuilderAuth. Requests without a valid token are rejected with
  UnauthorizedError before the function body runs.

  Scenario: Anonymous cannot call getSandboxGitStatus
    When anonymous calls "getSandboxGitStatus"
    Then the call fails because they are unauthorized
```

### No inline comments

Scenarios must be self-explanatory. If a scenario needs a comment to explain what it's doing or why, the scenario title is wrong — rename it. Comments that explain system behavior belong in the feature description, not scattered above individual scenarios.

```gherkin
# Wrong
# commitSandboxChanges requires a message field, so calling it with no data
# triggers schema validation before assertBuilderAuth runs — hence UnprocessableContentError
# not UnauthorizedError. Pass valid data here so auth is actually reached.
Scenario: Anonymous cannot commit sandbox changes
  When anonymous calls "commitSandboxChanges" with:
    | message | test commit |
  Then the call fails because they are unauthorized

# Right — the title says what it tests; the feature description explains the schema-before-auth rule
Scenario: Anonymous cannot commit sandbox changes
  When anonymous calls "commitSandboxChanges" with:
    | message | test commit |
  Then the call fails because they are unauthorized
```

### Scenario Outline for repeated patterns

When multiple scenarios have identical step structure with only the data varying, collapse them into a `Scenario Outline`:

```gherkin
# Wrong — 6 identical scenarios differing only by function name
Scenario: Anonymous cannot call listTodos
  When an anonymous user calls "listTodos"
  Then the call fails because they are unauthorized

Scenario: Anonymous cannot call createTodo
  When an anonymous user calls "createTodo"
  Then the call fails because they are unauthorized
# ... repeated 4 more times

# Right — one outline, one table
Scenario Outline: Anonymous cannot call protected functions
  When anonymous calls "<function>"
  Then the call fails because they are unauthorized

  Examples:
    | function   |
    | listTodos  |
    | createTodo |
    | deleteTodo |
    | updateTodo |
    | getTodo    |
    | archiveTodo |
```

The `Examples:` block drives one scenario per row — same test, different data. Use this whenever you have 3+ scenarios sharing the same step structure.

### Schema validation order gotcha

If a function has required input fields AND auth is checked in the function body (not in `permissions`), calling the function with missing/null data will trigger **schema validation before auth** — even for anonymous callers. The error will be `UnprocessableContentError`, not `UnauthorizedError`.

Fix: when testing auth rejection on a function that requires input, pass valid data so schema passes and auth is reached:

```gherkin
# Wrong — commitSandboxChanges requires message; schema rejects null data before auth runs
Scenario: Anonymous cannot commit changes
  When anonymous calls "commitSandboxChanges"
  Then the call fails because they are unauthorized  # fails! gets UnprocessableContentError

# Right — pass valid data so assertBuilderAuth is actually reached
Scenario: Anonymous cannot commit changes
  When anonymous calls "commitSandboxChanges" with:
    | message | test commit |
  Then the call fails because they are unauthorized
```

A symptom: the function appears in both a validation test (`the call fails`) and an auth test (`the call fails because they are unauthorized`). That's correct — they test two different paths.

### Never stub the schema service

The schema service must always be real. A stubbed schema makes validation a no-op: required fields pass silently, the function body runs with null input, and you get `TypeError` instead of `UnprocessableContentError`. Tests appear to pass but validate nothing.

In `createStubServices`, exclude `schema` from the catch-all Proxy so `createSingletonServices` falls through to creating a real `CFWorkerSchemaService`:

```typescript
// Wrong — stubs everything including schema; schema validation becomes a no-op
const injected = new Proxy({} as Record<string, unknown>, {
  get(_, prop: string) {
    return tracker.stub(prop)
  },
})

// Right — schema excluded from stub; real CFWorkerSchemaService is created
const injected = new Proxy({} as Record<string, unknown>, {
  get(_, prop: string) {
    if (prop === 'schema') return undefined
    return tracker.stub(prop)
  },
})
```

This applies to every test harness without exception.

## Coverage-Driven Test Writing

When asked to improve or fill test coverage, start with the AI prompt from the coverage command:

```bash
# Run tests and emit an AI-ready prompt listing every uncovered/partial function
pikku tests coverage --ai-out coverage-prompt.md

# Or skip re-running if you already have fresh coverage data
pikku tests coverage --no-run --ai-out coverage-prompt.md

# Pipe directly to stdout (e.g. to paste into a chat)
pikku tests coverage --ai-out -
```

The prompt lists each function that needs work with its status (`uncovered`/`partial`), coverage ratio, missed line numbers, and source file path. Use it as your starting point:

1. Read the prompt to know which functions need Gherkin scenarios.
2. Run `pikku meta functions list` or `pikku meta context` to get input/output schemas for those functions.
3. Write `.feature` files under `tests/tests/features/` — one feature per domain, one scenario per case.
4. Re-run `pikku tests coverage` to confirm coverage improved.

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

    const result = await createTodo.func(mockServices as any, {
      title: 'Buy milk',
    })

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
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
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
  const mockSingletonServices = {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  } as any

  const order: string[] = []

  const createMiddleware =
    (name: string) => async (services: any, wire: any, next: Function) => {
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
    func: async () => {
      order.push('main')
      return 'ok'
    },
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
  const mockSingletonServices = {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  } as any

  addPermission('admin', [
    async () => false, // Always deny
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
import { resetPikkuState, pikkuState, addFunction } from '@pikku/core'

const mockSingletonServices = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as any

const listTodos = {
  func: async () => ({ todos: [{ id: '1', title: 'Test todo' }] }),
}

beforeEach(() => {
  resetPikkuState()

  // Set up singleton services in state
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  })
})

test('GET /todos returns todo list', async () => {
  // Register route metadata and function
  pikkuState(null, 'http', 'meta')['get'] =
    pikkuState(null, 'http', 'meta')['get'] || {}
  pikkuState(null, 'http', 'meta')['get']['/todos'] = {
    pikkuFuncId: 'listTodos',
    method: 'get',
    route: '/todos',
  }
  addFunction('listTodos', listTodos)
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
const server = new PikkuFastifyServer(
  config,
  singletonServices,
  createWireServices
)
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
    const result = await createTodo.func({ todoStore } as any, {
      title: 'Buy milk',
    })

    assert.equal(result.id, '1')
    assert.equal(result.title, 'Buy milk')
  })

  test('increments IDs', async () => {
    await createTodo.func({ todoStore } as any, { title: 'First' })
    const second = await createTodo.func({ todoStore } as any, {
      title: 'Second',
    })

    assert.equal(second.id, '2')
  })
})
```

## Anti-Patterns

### Inline data in feature files

**Wrong** — raw values and JSON in `.feature` files make scenarios brittle and unreadable:

```gherkin
When I call 'kanban:createCard' with {"title": "My card", "columnId": "backlog"}
And I call 'kanban:getCard' with {"title": "My card"}
Then the result title is "My card"
```

**Right** — named references resolved by step definitions:

```gherkin
When 'yasser' creates a card for 'writing a blog post'
And 'yasser' gets the card 'writing a blog post'
Then the result is the newly created card 'writing a blog post'
```

### Feature-coupled step definitions

Steps tied to one feature can't be reused and cause duplication. Organise by **domain concept**, not by feature:

```
Wrong:                          Right:
steps/
  edit_work_experience.ts  →    steps/
  edit_languages.ts        →      auth.steps.ts
  edit_education.ts        →      profile.steps.ts
                                  card.steps.ts
```

Name step files after the domain they cover. A login step belongs in `auth.steps.ts` regardless of which feature needs it.

### Conjunction steps

Don't combine multiple actions into a single step — it makes reuse impossible:

```gherkin
# Wrong — two actions in one step
Given 'yasser' is logged in and has created a card
```

```gherkin
# Right — atomic steps, composable via And
Given 'yasser' logs in
And 'yasser' creates a card for 'writing a blog post'
```

Use `And` / `But` for a reason: each step should do exactly one thing.

### Asserting in When steps

`When` steps perform actions; `Then` steps assert outcomes. Mixing them hides intent:

```gherkin
# Wrong
When 'yasser' creates a card and the title is 'writing a blog post'

# Right
When 'yasser' creates a card for 'writing a blog post'
Then the call succeeds
```

### Hard-coding persona data in step definitions

Credentials and test inputs embedded in step code can't be reused across scenarios and break when data changes:

```ts
// Wrong
Given('{string} logs in', async function (name: string) {
  await this.call(name, 'auth:login', { email: 'yasser@example.com', password: 'hunter2' })
})

// Right — look up from PersonaData
Given('{string} logs in', async function (name: string) {
  await this.call(name, 'auth:login', logins.get(name))
  this.setSession(name, (this.lastResult as { token: string }))
})
```
