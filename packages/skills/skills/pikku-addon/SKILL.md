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
import { wireAddon } from '#pikku/addon'

wireAddon({
  name: string,                    // Namespace for addon functions (e.g. 'todos')
  package: string,                 // NPM package name (e.g. '@pikku/addon-todos')
  rpcEndpoint?: string,            // Optional remote RPC endpoint for distributed execution
  auth?: boolean,                  // Require a session for every function in the addon
  mcp?: boolean,
  tags?: string[],                 // Tags applied to all addon functions
  scopes?: string[],               // Required of every function, on top of its own
  secretOverrides?: Record<string, string>,      // Remap secret names (and grant them)
  variableOverrides?: Record<string, string>,    // Remap variable names
  credentialOverrides?: Record<string, string>,  // Remap credential names (and grant them)
  secretGrants?: string[],                       // Secrets the app lends this addon
  credentialGrants?: string[],                   // Credentials the app lends this addon
  globalSecrets?: string,                        // Reason for handing over the whole SecretService
  globalCredentials?: string,                    // Reason for handing over the whole CredentialService
})
```

**`auth`, `tags` and `scopes` only ever tighten.** `auth: false` is not honoured —
it would weaken the wiring's own gate — so the addon-level setting can require a
session but never waive one. The same package wired twice under two namespaces is
governed by the union of both instances' scopes and tags.

### An addon reads only the secrets it declared

An addon's `SecretService` and `CredentialService` are **scoped**: it may read
the secrets its own source declares (literal `getSecret('X')` calls and
`wireSecret` definitions, which the CLI collects into `declaredSecrets`) and
nothing else. Anything undeclared throws `Access denied to secret key: X` at
runtime. The same holds for credentials, and a scoped addon can never call
`getAllUsers()`.

That works for an addon naming its own secrets. It does not work for a _generic_
addon whose secret names arrive as data — `@pikku/addon-graph` reads
`getSecret(auth.credential)`, where the name comes off the workflow node — so
such an addon declares nothing and is scoped to nothing. Only the consuming app
can widen it, with one of three fields:

```typescript
wireAddon({
  name: 'graph',
  package: '@pikku/addon-graph',

  secretGrants: ['STRIPE_KEY'], // lend these, unrenamed
  secretOverrides: { MAILGUN_KEY: 'PROD_EMAIL_KEY' }, // lend + rename
  // globalSecrets: 'why no static list can cover it' // lend everything
})
```

| field             | meaning                                 |
| ----------------- | --------------------------------------- |
| `secretOverrides` | grant **and** rename                    |
| `secretGrants`    | grant as-is                             |
| `globalSecrets`   | grant everything, with a written reason |

**Grants name the secret as the addon reads it**, not as your project stores it.
Scoping is checked _before_ the override map renames anything, so an overridden
secret is granted by its addon-side key — which is also why an override's key
grants and its value does not. With no rename in play the two names coincide.

`globalSecrets` / `globalCredentials` take the _reason_ for the grant, not a
boolean, because every grant is enumerated in the deploy manifest
(`unscopedSecretAddons`, `grantedSecretAddons`). Prefer `secretGrants` — reach
for `globalSecrets` only when no static list can exist, and never for an addon
that performs outbound requests, where an unrestricted secret read is an
exfiltration primitive.

A grant naming a secret your project does not declare is a build error from
`pikku all`, resolved through the override map first:

```
Secret grant 'STIRPE_KEY' in addon 'graph' (@pikku/addon-graph) targets a secret
that does not exist. Available secrets: BETTER_AUTH_SECRET, GITHUB_OAUTH
```

### `ref(name)`

Type-safe reference to a function — local or addon — for use in any wiring. It
returns a function config that proxies the call via RPC at runtime:

```typescript
import { ref } from '#pikku/function'

ref('todos:addTodo') // namespace:functionName for an addon function
ref('myLocalFunc') // a local function by name
```

There is no `addon()` helper; `ref()` covers both. For an addon that publishes
**wiring contracts** rather than bare functions, codegen also emits `refHTTP`,
`refChannel` and `refCLI`, which carry the addon's own route/config metadata:

```typescript
import { refHTTP } from '#pikku/function'

wireHTTP(refHTTP('todos:listTodos', { basePath: '/api' }))
```

### `pikkuAddonServices(factory)`

Define singleton services for an addon package (created once at startup). The
second argument is always present — an addon never falls back to its own logger,
variables or secrets; the consuming app supplies them:

```typescript
import { pikkuAddonServices } from '#pikku/setup'

export const createSingletonServices = pikkuAddonServices(
  async (config, { secrets, logger }) => {
    const creds =
      await secrets.getSecret<GithubCredentials>('GITHUB_CREDENTIALS')
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
import { pikkuAddonWireServices } from '#pikku/setup'

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
import { pikkuAddonServices, pikkuAddonWireServices } from '#pikku/setup'
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

An addon's generated tree roots at `.pikku/addon/`, but its `imports` map points
`#pikku/*` there, so it authors against the same subpaths an application does —
`#pikku/function`, `#pikku/http`. The `addon` segment is the package's own
business, never part of a specifier.

```typescript
// src/functions/addTodo.function.ts
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

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
yarn pikku all          # Generate types
yarn tsc                # Compile TypeScript
cp -r .pikku types dist/  # Ship the generated files and the types they import
yarn pikku validate     # Check the published file set holds together
```

`yarn pikku`, not `npx pikku`: a scaffolded addon carries `@pikku/cli` as a
devDependency, and building it against a different CLI than it declares is how
generated output ends up disagreeing with the packaged one. `npx pikku new
addon` above is the exception — it runs before the addon, and its CLI, exist.

`types/` has to be copied alongside `.pikku`: the generated files import
`SingletonServices`, `Services`, `Config` and `UserSession` from
`../../types/application-types.d.js`, and `tsc` never emits a hand-written
`.d.ts` to `outDir`, so nothing else puts it in `dist`. Leave it out and the
addon installs fine and fails to typecheck in every app that depends on it —
which is what `pikku validate` is there to catch before you publish.

## Consuming an Addon

### Install & Register

```bash
yarn add @my-org/addon-todos
```

```typescript
// wirings/todos.wirings.ts
import { wireAddon } from '#pikku/addon'

wireAddon({ name: 'todos', package: '@my-org/addon-todos' })
```

After registration, run `yarn pikku all` to generate types for the addon's functions.

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
import { wireHTTP } from '#pikku/http'
import { ref } from '#pikku/function'

wireHTTP({
  method: 'get',
  route: '/todos',
  func: ref('todos:listTodos'),
  auth: false,
})
```

Or batch multiple addon routes with `defineHTTPRoutes` + `wireHTTPRoutes`:

```typescript
import { wireHTTPRoutes, defineHTTPRoutes } from '#pikku/http'
import { ref } from '#pikku/function'

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
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

export const todoAgent = pikkuAgent({
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

See `pikku-agent` — an addon function is just another `ref()` in `tools`.
