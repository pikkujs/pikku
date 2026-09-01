---
name: pikku-concepts
description: >-
  Use FIRST in any Pikku codebase, before writing an import or reaching for another pikku skill.
  Covers the core mental model, function types, project structure, code generation and testing,
  and how to read `pikku doc` — the API surface of the pikku actually installed here, which also
  indexes which skill teaches each door. TRIGGER when: starting any Pikku task, about to import
  from `#pikku/*`, unsure whether an export exists or what its options are called, choosing which
  pikku skill to load, a build failed on an unknown import or option, or migrating an existing
  backend to Pikku. DO NOT TRIGGER when: the task is not a Pikku project.
installGroups: [core]
---

# Pikku Framework Concepts

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run `pikku doc --ai` for the installed API surface, and the relevant `pikku meta ... --json` for what this project has wired.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

Pikku is a TypeScript framework that separates business logic from transport mechanisms. You define a function once, then wire it to HTTP, WebSocket, queues, schedulers, MCP, CLI, or RPC — without the function knowing how it's being called.

## Ask The Installed Pikku, Don't Guess

Pikku generates `#pikku/*` imports per project and changes between versions. Anything you
remember about its API may be from a different version than the one in this directory.
Everything below is the mental model; `pikku doc` is the API surface, computed when the
installed CLI was built. It needs no config and works outside a project.

**Do not write an import, an export name, or an option key you have not seen in `pikku doc`.**
A name that looks right and is not costs a full build cycle to discover. If the doc does not
list it, it does not exist here — do not reach into `node_modules` or `.pikku` for something
that will work anyway.

### Start here, every time

```
pikku doc --ai
```

≈480 tokens, giving the 20 `#pikku/*` doors grouped by the job they do, and beside each the
skill that teaches it. Read that routing table as the index to every other pikku skill — it is
generated from the installed version, so it never names a skill for a door that no longer exists.

Then go one of two ways. For **what exists** — the exact export name, its options, its
signature — stay in the doc:

```
pikku doc http                 one door: its exports, each with a signature or a key count
pikku doc wireHTTP             one export: signature, every key with what it is for
pikku doc wireHTTP pikkuFunc   several topics in one call, rather than one call each
```

For **how it fits together** — composition, lifecycle, the generated client — load the skill
the routing table named. The doc lists keys; it does not teach patterns.

On a door screen, `N keys — pikku doc X` means a second call buys you something; an inlined
signature means it does not. Error classes carry the HTTP status they are registered with,
which is what decides whether a thrown error becomes a 409 or a 500.

### Two things the doc will not give you

- **Worked examples are sparse.** Most exports show a signature and keys, not usage.
- **`pikkuFunc` lists keys that belong elsewhere.** `before`, `after`, `skip`, `surfaces` and
  `requiresActor` apply only to scenarios; `workflowQueued`, `workflowRetries` and
  `workflowTimeout` only to a workflow step. One shared config type offers all of them to
  every function — each key says which it belongs to.

`pikku doc` needs `@pikku/cli` 0.12.115 or newer. On an older pin, fall back to the door's
skill and `pikku meta --json`, and do not guess at names the doc would have given you.

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
    ├── pikkuAgent    → AI agents / chatbots
    ├── pikkuWorkflow   → Multi-step durable workflows
    └── wire.rpc        → Internal function-to-function calls
```

A `pikkuFunc` receives three things:

1. **Services** — injected dependencies (logger, db, jwt, custom stores). See `pikku-services`.
2. **Data** — input from any source (HTTP body/query/params, WS message, queue payload, CLI args)
3. **Wire** — transport context (session, channel, rpc, mcp, http, queue)

The function never imports Express, never reads `req.body`, never touches `ws.send()`. It just works with typed data and services.

## Concept Mapping: Generic Backend → Pikku

Controllers/routes → `pikkuFunc`; auth/sessions and authorization checks → `pikku-auth`, a separate install; request interception → `pikku-middleware`; DI → `pikku-services`; transports (HTTP/WS/queue/cron) → their `wire*` + skill. For the full Generic Backend → Pikku mapping table (with side-by-side code examples), read `references/concept-mapping.md`.

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
  // Identity and documentation — prose, so it follows `metaLocale` in
  // pikku.config.json (default `en`). The identifier does not; see
  // "What Language You Write In".
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
  expose?: boolean,         // Allow external RPC calls (see pikku-wiring)
  remote?: boolean,         // Allow remote RPC calls
  mcp?: boolean,            // Expose as MCP tool (see pikku-wiring)
  readonly?: boolean,       // Declares the function performs no writes
  deploy?: 'serverless' | 'server' | 'auto',

  // Authorization — see pikku-auth
  auth?: boolean,           // Override default auth requirement
  scopes?: ScopeId[],       // AND-ed, checked before permissions; session required
  permissions?: PermissionGroup,  // OR-ed pool
  permissionsInBody?: boolean,    // Last resort; needs allow.permissionsInBody in config
  middleware?: PikkuMiddleware[], // See pikku-middleware

  // Agent tooling — see pikku-agent
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
types come from _one_ source: either the `input`/`output` schemas (preferred —
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

**Only `pikku dev` and `pikku serve` invoke these hooks.** No deploy runtime does, so anything a Workers or serverless stage needs done cannot live here — put it on the request path that needs it, guarded by a cheap check.

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

`pikku validate` warns when a project starts a server by hand _and_ depends on no runtime adapter, since that combination means path 1 was available and unused. Silence it with `"lint": { "customServerBootstrap": "off" }` in `pikku.config.json`.

## Code Generation

Run `npx pikku all` to generate:

- one directory per wiring (`function/`, `http/`, `workflow/`, …), each with an
  `index.ts` reached as `#pikku/<name>` — typed function factories and wiring
  functions, split so an app pulls in only the wirings it uses
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
├── middleware.ts         # Middleware definitions (see pikku-middleware)
├── permissions.ts       # Permission definitions (see pikku-auth)
└── .pikku/              # Generated (gitignored)
    ├── function/        # #pikku/function
    ├── http/            # #pikku/http
    ├── pikku-fetch.gen.ts
    └── pikku-bootstrap.gen.ts
```

## What Language You Write In

Three different things in a Pikku project have a human language, and they are
**not** the same language. Collapsing them is the mistake this section exists to
prevent, and it has already shipped in a real product — the failure is at the
bottom.

| Axis            | What it covers                                                                                                                                                    | What decides it                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Identifiers** | Function, component, type, variable and file names. Database tables and columns. Branch names and commit messages.                                                | Nothing. **Always English.** There is no setting.                                                           |
| **Meta**        | The prose authored _inside_ the code: `description` on functions and steps, `name`/`title` on features and scenarios, step `template`, role/persona descriptions. | `metaLocale` in `pikku.config.json`. Defaults to `en`.                                                      |
| **Product UI**  | Every string the app shows a user.                                                                                                                                | `messages/<locale>.json`, with `active.json`'s `defaultLocale` choosing what a first-time visitor opens in. |

### Identifiers are English, and nothing changes that

Not the product's market, not the team's working language, and **not `metaLocale`**.
A German medical practice, an Arabic marketplace and a Japanese logistics tool
all get `getOverview`, `AttentionStripe`, `case`, `event`.

This is not linguistic preference, it is mechanics. Identifiers are the surface
every other tool binds to: the generated `#pikku/*` clients, `pikku info` and
`pikku meta`, the RPC map a scenario's `actor.invoke` is typed over, the
generated SQL types, every skill and every agent that ever picks the project up.
A `vorgang` table types as `Vorgang` in Kysely and reads as noise to everyone who
did not name it, and unlike a string it cannot be translated later — renaming an
identifier is a migration, not an edit.

### Meta follows `metaLocale`, and that is what the field is for

```json
{ "metaLocale": "de" }
```

Meta is the one part of a project the **Pikku Console** renders back to a human.
A team reviewing their own functions, features and scenario reports in the
Console is reading meta and nothing else, so a team whose working language is
German should be able to read their Console in German. That is the entire reason
the field exists.

Read it before you author meta, and write descriptions, titles and templates in
it. Absent, it is `en`. It is a BCP-47 tag (`en`, `de`, `pt-BR` — a hyphen, not
an underscore), and the CLI rejects anything else by name.

`metaLocale` is **not** licence to rename anything. `metaLocale: "de"` buys a German
`description: 'Zeigt die Arbeitsliste'` on a function still called
`getWorklist`.

### Product UI language lives in the catalogue, and only there

What the app says to its users is a translation concern, not a code concern. It
belongs in `messages/<locale>.json`; `pikku-i18n` owns the details. The one rule
worth repeating here: **`baseLocale` in `project.inlang/settings.json` stays
`en`.** It names the message _source_ — the catalogue every other language is
cloned from and translated against — so a project that sets it to anything else
has no English catalogue to translate from and can never gain a second language
without re-authoring every key.

### The failure this comes from

An agent was asked to build a doctor's portal for a German practice. The brief
said "the entire UI is German, no English strings visible anywhere". The agent
read one sentence about the product's users as an instruction about the
codebase, and produced:

- `project.inlang/settings.json` with `baseLocale: "de"` and `locales: ["de"]`,
  no `en.json` at all — which silently broke `--add-locale` forever
- RPC functions `getUebersicht` and `getPatientendetail`
- React components `Zeitstrahl` and `AufmerksamkeitStreifen`
- database tables `vorgang` and `ereignis`, with German columns

Every one of those is wrong, and the brief was satisfied by none of them: a
German UI needs German _messages_. What that project actually wanted was three
settings, each on its own axis:

```jsonc
// project.inlang/settings.json — the message source stays English
{ "baseLocale": "en", "locales": ["en", "de"] }

// apps/app/src/i18n/active.json — what a first-time visitor opens in
{ "defaultLocale": "de" }

// pikku.config.json — the language the team reads their Console in
{ "metaLocale": "de" }
```

Identifiers stay English throughout. When a brief tells you the product speaks a
language, it is telling you about axis three and nothing else.

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
