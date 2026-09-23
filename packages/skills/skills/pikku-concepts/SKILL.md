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

## The CLI commands

`pikku doc` is the API surface — the `#pikku/*` exports. It does **not** list
commands, so this table is where they exist. `pikku <command> --help` has the
flags; the "Read" column is the skill that teaches the thing, where one does.

**Generating**

| Command                                    | What it does                                         | Read                          |
| ------------------------------------------ | ---------------------------------------------------- | ----------------------------- |
| `all`                                      | Everything: types, schemas, wirings, clients         | this skill                    |
| `bootstrap`                                | Type files only (the setup phase)                    | this skill                    |
| `schemas`                                  | JSON Schemas for function input/output types         | this skill                    |
| `fetch` / `websocket` / `rpc` / `realtime` | One client each, when you do not want `all`          | `pikku-wiring`, `pikku-react` |
| `react-query` / `tanstack-start`           | React Query hooks; the TanStack Start `makeApi` shim | `pikku-react`                 |
| `queue-service`                            | The queue service wrapper                            | `pikku-wiring`                |
| `openapi`                                  | An OpenAPI spec from the HTTP routes                 | —                             |
| `nextjs`                                   | Next.js backend and HTTP wrappers                    | `pikku-deploy`                |
| `new`                                      | Scaffold a function or wiring                        | `pikku-wiring`                |
| `enable`                                   | Turn a Pikku feature on                              | `pikku-build`                 |
| `import`                                   | Import workflows from another system                 | `pikku-n8n-import`            |

**Running**

| Command                      | What it does                                                                   | Read                                    |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| `dev`                        | Local dev server, all services wired, watch + HMR                              | `pikku-build`                           |
| `serve`                      | Bundled bun/node runner — no watch, no codegen                                 | `pikku-deploy`                          |
| `watch`                      | Regenerate on file change, without a server                                    | —                                       |
| `scenario list\|run`         | Scenarios as e2e tests and health checks                                       | `pikku-scenario`                        |
| `persona run`                | A declared persona as a model-driven virtual user against a stage              | `pikku-scenario`, persona-run reference |
| `persona list\|sync\|secret` | Who is declared; what an environment will provision; minting their credentials | `pikku-scenario`, persona-run reference |
| `db`                         | Local development database                                                     | `pikku-kysely`                          |

**Inspecting and evolving**

| Command               | What it does                                                            | Read                         |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `doc`                 | The installed API surface                                               | this skill                   |
| `meta` / `info`       | What the project declares, machine- and human-readable                  | `pikku-meta`                 |
| `validate`            | Every check that applies — app structure, an addon's published file set | `pikku-build`, `pikku-addon` |
| `versions` / `semver` | Contract hashes, breaking-change detection, the release semver          | `pikku-meta`                 |
| `audit` / `update`    | Advisories; which `@pikku/*` can move and what peers that needs         | `pikku-meta`                 |
| `scopes` / `roles`    | Declared authorization scopes; roles from `defineSystemRole`            | `pikku-auth`                 |
| `knowledge`           | The knowledge base — what this app is, in its users' language           | `pikku-knowledge`            |
| `emails`              | Email template generation                                               | `pikku-emails`               |

**Shipping, and the CLI itself**

| Command                       | What it does                                                                                                                                   | Read           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `deploy`                      | Deploy to cloud infrastructure                                                                                                                 | `pikku-deploy` |
| `fabric`                      | PikkuFabric: login, link, deploy, domains, secrets, logs                                                                                       | `pikku-fabric` |
| `binary`                      | Compile an entrypoint to a native binary (`bun build --compile`)                                                                               | —              |
| `dist`                        | Copy what `tsc` cannot emit — `.gen.json` meta, hand-authored `.d.ts` — into the build output. Run it after `tsc`, as a package's build script | —              |
| `login` / `logout` / `whoami` | The CLI's session against a pikku server                                                                                                       | —              |
| `skills`                      | Install these skills into an agent (Claude Code, opencode, pi)                                                                                 | —              |

`-c/--config`, `--log-level`, `--json` and the filter flags are **global
options**, not commands — they attach to the generating commands above.

A dash means no skill covers it beyond this line. `--help` is then the whole of
it — which is a reason to read `--help` rather than to assume the command does
what its name suggests.

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
  version?: number,         // Contract version (see pikku-meta)
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

Two ways to start a Pikku app, and the choice is whether you need to own the HTTP server.

**Let Pikku own it** — `pikku dev` and `pikku serve` create the config and singleton services,
start the server and shut it down cleanly, so you write no bootstrap code at all. Startup and
shutdown work goes in one exported `pikkuServerLifecycle` (`beforeStart` / `afterStart` /
`beforeStop`). **Only `dev` and `serve` invoke those hooks** — no deploy runtime does, so anything
a Workers or serverless stage needs done belongs on the request path that needs it.

**Bootstrap it yourself** — required for Express, Fastify, uWS, Lambda, Cloudflare and Next.js,
where Pikku is embedded in a server you own. Lifecycle hooks do not run on this path; do the
startup work in the entrypoint.

`pikku validate` warns when a project starts a server by hand *and* depends on no runtime adapter,
because that means the first path was available and unused.

**`references/bootstrap.md`** has both entrypoints in full.

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

Three different things in a Pikku project have a human language, and they are **not** the same
language. Collapsing them has already shipped in a real product:

| Axis            | Covers                                                                        | Decided by                                     |
| --------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| **Identifiers** | Function, component, type and file names; tables and columns; commit messages | Nothing. **Always English.** There is no setting |
| **Meta**        | Prose authored inside the code — `description`, `title`, step `template`      | `metaLocale` in `pikku.config.json` (default `en`) |
| **Product UI**  | Every string the app shows a user                                             | `messages/<locale>.json`, and `active.json`'s `defaultLocale` |

Identifiers are the surface every other tool binds to — the generated clients, the RPC map a
scenario is typed over, the SQL types — and unlike a string an identifier cannot be translated
later: renaming one is a migration. `metaLocale` exists so a team can read their own Console in
their own language; it is not licence to rename anything. And `baseLocale` in
`project.inlang/settings.json` stays `en`, because it names the message *source* every other
language is cloned from.

**When a brief tells you the product speaks a language, it is telling you about the third axis and
nothing else.** `references/language.md` has the three settings that satisfy such a brief, and the
build that read one sentence about a product's users as an instruction about its codebase — German
RPC names, German tables, and no English catalogue to ever translate from.

## Environment Variables

Never use `process.env` inside Pikku functions. Use the `variables` service (see `pikku-services`):

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
