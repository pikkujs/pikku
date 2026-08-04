---
name: pikku-addon
description: >-
  Use when creating or consuming reusable function packages (addons) in Pikku. Covers wireAddon,
  ref(), pikkuAddonServices, pikkuAddonWireServices, addon package structure, and cross-project
  function sharing. TRIGGER when: code uses wireAddon/ref()/pikkuAddonServices, user asks about
  addons, reusable function packages, cross-project sharing, or addon package structure. DO NOT
  TRIGGER when: user asks about internal function composition (use pikku-rpc) or general function
  definitions (use pikku-concepts).
installGroups: [core]
---

# Pikku Addons

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Addons are reusable Pikku function packages that can be shared across projects. They bundle functions, services, secrets, and variables into a self-contained NPM package.

## Before You Start

```bash
pikku info functions --verbose   # See existing functions and addons
pikku info tags --verbose        # Understand project organization
```

See `pikku-concepts` for the core mental model.

## API Reference

### `wireAddon(config)`

Register an addon in the consuming project:

```typescript
import { wireAddon } from '#pikku'

wireAddon({
  name: string,                    // Namespace for addon functions (e.g. 'todos')
  package: string,                 // NPM package name (e.g. '@pikku/addon-todos')
  rpcEndpoint?: string,            // Optional remote RPC endpoint for distributed execution
  auth?: boolean,                  // Require a session for every function in the addon
  mcp?: boolean,
  tags?: string[],                 // Tags applied to all addon functions
  scopes?: string[],               // Required of every function, on top of its own
  secretOverrides?: Record<string, string>,      // Remap secret names
  variableOverrides?: Record<string, string>,    // Remap variable names
  credentialOverrides?: Record<string, string>,  // Remap credential names
})
```

**`auth`, `tags` and `scopes` only ever tighten.** `auth: false` is not honoured —
it would weaken the wiring's own gate — so the addon-level setting can require a
session but never waive one. The same package wired twice under two namespaces is
governed by the union of both instances' scopes and tags.

### `ref(name)`

Type-safe reference to a function — local or addon — for use in any wiring. It
returns a function config that proxies the call via RPC at runtime:

```typescript
import { ref } from '#pikku'

ref('todos:addTodo') // namespace:functionName for an addon function
ref('myLocalFunc') // a local function by name
```

There is no `addon()` helper; `ref()` covers both. For an addon that publishes
**wiring contracts** rather than bare functions, codegen also emits `refHTTP`,
`refChannel` and `refCLI`, which carry the addon's own route/config metadata:

```typescript
import { refHTTP } from '#pikku'

wireHTTP(refHTTP('todos:listTodos', { basePath: '/api' }))
```

### `pikkuAddonServices(factory)`

Define singleton services for an addon package (created once at startup). The
second argument is always present — an addon never falls back to its own logger,
variables or secrets; the consuming app supplies them:

```typescript
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(
  async (config, { secrets, logger }) => {
    const creds = await secrets.getSecret<GithubCredentials>('GITHUB_CREDENTIALS')
    return { github: new GithubService(creds.reveal()) }
  }
)
```

`secrets` and `variables` arrive **typed against the addon's own declarations**,
and a secret is a `SecretValue` — `.reveal()` is the only way to the plaintext
(see `pikku-config`). `pikkuAddonConfig` is the matching factory for the addon's
config object.

### `pikkuAddonWireServices(factory)`

Define per-request services for an addon package (created fresh per HTTP request, queue job, etc.):

```typescript
import { pikkuAddonWireServices } from '#pikku'

export const createWireServices = pikkuAddonWireServices(
  async (singletonServices, wire) => {
    // wire: transport context (http, channel, session, etc.)
    const authHeader = wire.http?.request?.header('authorization')
    return {
      myService: new MyService(authHeader),
    }
  }
)
```

## Creating an Addon

### Scaffold

```bash
npx pikku new addon <name>          # name is a required positional
npx pikku new addon stripe --display-name Stripe --category Payments --dir addons
```

This generates `package.json` (exports `.pikku/*` + `dist/`), `pikku.config.json` (`addon: true`), `tsconfig.json` (`#pikku` path mapping), `src/services.ts`, `src/functions/`, and `types/application-types.d.ts`. For the full file contents/exports you rarely hand-edit, read `references/addon-package-manifest.md`.

### Services

```typescript
// src/services.ts
import { pikkuAddonServices, pikkuAddonWireServices } from '#pikku'
import { TodoStore } from './todo-store.service.js'

export const createSingletonServices = pikkuAddonServices(async () => {
  const todoStore = new TodoStore()
  return { todoStore }
})

// Optional — only needed if addon functions require per-request services
export const createWireServices = pikkuAddonWireServices(
  async (singletonServices, wire) => {
    return {}
  }
)
```

### Functions

```typescript
// src/functions/addTodo.function.ts
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

const AddTodoInput = z.object({ title: z.string() })
const AddTodoOutput = z.object({ id: z.string(), title: z.string() })

export const addTodo = pikkuSessionlessFunc({
  description: 'Adds a new todo',
  input: AddTodoInput,
  output: AddTodoOutput,
  func: async ({ todoStore }, { title }) => {
    return todoStore.add(title)
  },
})
```

Optional approval gating (e.g. for agent tools) — add `approvalRequired: true` plus an `approvalDescription` resolver:

```typescript
approvalRequired: true,
approvalDescription: async (_services, { title }) => `Add a todo called "${title}"`,
```

### Build

```bash
npx pikku all    # Generate types
yarn tsc         # Compile TypeScript
cp -r .pikku dist/  # Include generated files in dist
```

## Consuming an Addon

### Install & Register

```bash
yarn add @my-org/addon-todos
```

```typescript
// wirings/todos.wirings.ts
import { wireAddon } from '#pikku'

wireAddon({ name: 'todos', package: '@my-org/addon-todos' })
```

After registration, run `npx pikku all` to generate types for the addon's functions.

### Call via RPC

```typescript
export const myFunc = pikkuFunc({
  func: async (_services, data, { rpc }) => {
    const todo = await rpc.invoke('todos:addTodo', { title: 'Buy milk' })
    return todo
  },
})
```

### Wire to HTTP

```typescript
import { wireHTTP, ref } from '#pikku'

wireHTTP({
  method: 'get',
  route: '/todos',
  func: ref('todos:listTodos'),
  auth: false,
})
```

Or batch multiple addon routes with `defineHTTPRoutes` + `wireHTTPRoutes`:

```typescript
import { wireHTTPRoutes, defineHTTPRoutes, ref } from '#pikku'

const todoRoutes = defineHTTPRoutes({
  tags: ['todos'],
  auth: false,
  routes: {
    list: { method: 'get', route: '/todos', func: ref('todos:listTodos') },
    add: { method: 'post', route: '/todos', func: ref('todos:addTodo') },
  },
})

wireHTTPRoutes({ basePath: '/api', routes: { todos: todoRoutes } })
```

### Use in AI Agents

```typescript
import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku'

export const todoAgent = pikkuAIAgent({
  name: 'todo-agent',
  description: 'Manages a todo list',
  goal: 'You help users manage their todos.',
  model: 'openai/gpt-5-mini',
  tools: [
    ref('todos:listTodos'),
    ref('todos:addTodo'),
    ref('todos:deleteTodo'),
  ],
  maxSteps: 5,
})
```

See `pikku-ai-agent` — an addon function is just another `ref()` in `tools`.
