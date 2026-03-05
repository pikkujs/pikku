---
name: pikku-addon
description: 'Use when creating or consuming reusable function packages (addons) in Pikku. Covers wireAddon, addon(), pikkuAddonServices, pikkuAddonWireServices, addon package structure, and cross-project function sharing.
TRIGGER when: code uses wireAddon/addon()/pikkuAddonServices, user asks about addons, reusable function packages, cross-project sharing, or addon package structure.
DO NOT TRIGGER when: user asks about internal function composition (use pikku-rpc) or general function definitions (use pikku-concepts).'
---

# Pikku Addons

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
  auth?: boolean,                  // Whether addon functions require authentication
  tags?: string[],                 // Tags applied to all addon functions
  secretOverrides?: Record<string, string>,    // Remap secret names
  variableOverrides?: Record<string, string>,  // Remap variable names
})
```

### `addon(name)`

Type-safe reference to an addon function — use when wiring to HTTP, agents, etc.:

```typescript
import { addon } from '#pikku'

addon('todos:addTodo')    // Returns a typed function config
addon('emails:sendEmail') // Namespace:functionName format
```

### `pikkuAddonServices(factory)`

Define singleton services for an addon package (created once at startup):

```typescript
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(
  async (config, parentServices?) => {
    // parentServices: logger, variables, secrets from the consuming app
    return {
      myStore: new MyStore(),
    }
  }
)
```

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
npx pikku new addon
```

### Package Structure

```text
my-addon/
├── package.json               # Exports .pikku/* and dist/
├── pikku.config.json          # addon: true + metadata
├── tsconfig.json              # #pikku path mapping
├── src/
│   ├── services.ts            # createSingletonServices (required)
│   └── functions/
│       └── *.function.ts      # Function definitions
├── types/
│   └── application-types.d.ts # SingletonServices interface
└── .pikku/                    # Generated (gitignored)
```

### pikku.config.json

```json
{
  "tsconfig": "./tsconfig.json",
  "srcDirectories": ["src", "types"],
  "outDir": "./.pikku",
  "addon": true,
  "node": {
    "displayName": "My Addon",
    "description": "What this addon does",
    "categories": ["General"]
  }
}
```

### package.json (key fields)

```json
{
  "name": "@my-org/addon-todos",
  "imports": {
    "#pikku": "./.pikku/pikku-types.gen.ts",
    "#pikku/*": "./.pikku/*"
  },
  "exports": {
    ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" },
    "./.pikku/*": "./.pikku/*",
    "./.pikku/pikku-metadata.gen.json": "./.pikku/pikku-metadata.gen.json",
    "./.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js": {
      "types": "./.pikku/rpc/pikku-rpc-wirings-map.internal.gen.d.ts"
    }
  },
  "files": ["dist", ".pikku"],
  "peerDependencies": {
    "@pikku/core": "*"
  },
  "scripts": {
    "pikku": "pikku all",
    "build": "tsc && cp -r .pikku dist/"
  }
}
```

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
import { wireHTTP, addon } from '#pikku'

wireHTTP({
  method: 'get',
  route: '/todos',
  func: addon('todos:listTodos'),
  auth: false,
})
```

### Use in AI Agents

```typescript
import { pikkuAIAgent } from '#pikku'
import { addon } from '#pikku'

export const todoAgent = pikkuAIAgent({
  name: 'todo-agent',
  description: 'Manages a todo list',
  instructions: 'You help users manage their todos.',
  model: 'openai/gpt-4o',
  tools: [
    addon('todos:listTodos'),
    addon('todos:addTodo'),
    addon('todos:deleteTodo'),
  ],
  maxSteps: 5,
})
```

## Complete Example

```typescript
// --- ADDON PACKAGE: @my-org/addon-todos ---

// src/services.ts
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(async () => {
  return { todoStore: new TodoStore() }
})

// src/functions/listTodos.function.ts
export const listTodos = pikkuSessionlessFunc({
  description: 'List all todos',
  func: async ({ todoStore }) => {
    return { todos: todoStore.list() }
  },
})

// src/functions/addTodo.function.ts
export const addTodo = pikkuSessionlessFunc({
  description: 'Add a new todo',
  approvalRequired: true,
  approvalDescription: async (_services, { title }) => {
    return `Add a todo called "${title}"`
  },
  input: z.object({ title: z.string() }),
  output: z.object({ id: z.string(), title: z.string() }),
  func: async ({ todoStore }, { title }) => {
    return todoStore.add(title)
  },
})

// --- CONSUMING PROJECT ---

// wirings/addons.wirings.ts
import { wireAddon } from '#pikku'
wireAddon({ name: 'todos', package: '@my-org/addon-todos' })

// wirings/api.http.ts
import { wireHTTPRoutes, defineHTTPRoutes, addon } from '#pikku'

const todoRoutes = defineHTTPRoutes({
  tags: ['todos'],
  auth: false,
  routes: {
    list: { method: 'get', route: '/todos', func: addon('todos:listTodos') },
    add: { method: 'post', route: '/todos', func: addon('todos:addTodo') },
  },
})

wireHTTPRoutes({
  basePath: '/api',
  routes: { todos: todoRoutes },
})
```
