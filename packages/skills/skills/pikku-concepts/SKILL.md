---
name: pikku-concepts
description: >-
  Use FIRST, and whenever you are about to write or change Pikku code: core mental model, function
  types, project structure, code generation, testing, and reading `pikku doc` (the installed API surface, which also indexes which
  skill teaches each area). TRIGGER when: starting any Pikku task, about to import from `#pikku/*`,
  unsure an export or option exists, choosing which pikku skill to load, a build failed on an
  unknown import or option, or migrating a backend to Pikku. DO NOT TRIGGER when: the task is not a
  Pikku project.
installGroups: [core]
---

# Pikku Framework Concepts

## Operating procedure

1. Discover before editing. Run `pikku doc --ai` for the installed API surface, and the relevant `pikku meta ... --json` for what this project has wired.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku all` when functions, wirings, schemas, or generated clients may have changed.
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

Prints the `#pikku/*` doors, grouped by the job they do, and beside each the
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
  `requiresVirtualUser` apply only to scenarios; `workflowQueued`, `workflowRetries` and
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
    ├── mcp: true       → Model Context Protocol (AI tools; an option on the function, no wire call)
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

**MCP tools:** always set `mcp: true` on the normal function; HTTP, RPC and agents can still call it. The one exception is wrapping an EXISTING function as an AI tool purely to reshape its data: use `pikkuMCPToolFunc` (calls the original via `rpc.invoke`), which makes the wrapper MCP-only. The alternative is a second normal function with `mcp: true`. See `pikku-wiring`.

The function never imports Express, never reads `req.body`, never touches `ws.send()`. It just works with typed data and services.

## Concept Mapping: Generic Backend → Pikku

Controllers/routes → `pikkuFunc`; auth/sessions and authorization checks → `pikku-auth`, a separate install; request interception → `pikku-middleware`; DI → `pikku-services`; transports (HTTP/WS/queue/cron) → their `wire*` + skill. For the full Generic Backend → Pikku mapping table (with side-by-side code examples), read `references/concept-mapping.md`.

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

Identifiers (function, type, file, table and column names) are **always English**. `metaLocale` in
`pikku.config.json` is the language of authored meta (`description`, `title`, step `template`).
A product speaking another language is only about the UI strings in `messages/<locale>.json`.
Read `references/language.md` before touching any of the three.

## Available Packages

Pikku ships runtime adapters (`@pikku/express`, `@pikku/fastify`, `@pikku/next`, `@pikku/lambda`, `@pikku/cloudflare`, `@pikku/uws`, `@pikku/modelcontextprotocol`, ...) and service packages (`@pikku/jose`, `@pikku/schema-ajv`, `@pikku/pino`, `@pikku/kysely`, `@pikku/redis`, `@pikku/queue-bullmq`, `@pikku/queue-pg-boss`, ...). For the full list with use cases, read `references/packages.md`.

## Where the rest lives

- `references/cli.md` — every CLI command, with its flags.
- `references/functions.md` — function types, config keys and schemas (Standard Schema).
- `references/bootstrap.md` — letting Pikku own the server versus bootstrapping it yourself.
- `references/testing.md` — calling `.func` directly with mock services.
- Env vars and secrets: `pikku-services`. Never `process.env` inside a function.
- `references/language.md`, `references/concept-mapping.md`, `references/packages.md`.
