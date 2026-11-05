---
name: pikku-wiring
description: >-
  Expose a Pikku function: wireHTTP, SSE, channels, pub/sub, RPC, queue workers, cron, triggers, MCP, CLI, Slack gateway. Outgoing webhooks are pikku-webhook; live views are pikku-realtime.
installGroups: [core]
---

# Pikku Wiring

What to reach for and why. For how to call it, run this once, with the doors you need: `pikku doc http channel queue scheduler trigger mcp cli gateway wireHTTP`. Depth: the references named under Pick a wiring.

Discover first with `pikku meta ... --json`. Find the source that owns the behaviour; do not start from generated output, `.pikku`, `node_modules`, vendored packages or build artifacts. Make the smallest source change, never hand-edit SDKs, schema output or typegen, validate narrowly first, then `pikku all` when functions, wirings, schemas or clients may have changed. If validation fails, fix the source cause and rerun.

## Before you start

```bash
pikku info functions --verbose   # existing functions, their types, tags, middleware
pikku info tags --verbose        # project organisation and naming conventions
pikku info middleware --verbose  # what middleware is already applied
```

Follow the patterns you find. This skill is what the compiler cannot tell you:
which wiring to reach for, and what changes when you move a function from one to
another.

## What a wiring is

A **function** owns behaviour, its `input`/`output` schemas, and its
authorization. A **wiring** owns only the transport: how a caller reaches that
function. The same function can be wired to several transports at once, which is
why nothing transport-specific belongs in its body.

Three consequences that hold for every wiring below:

- **Input and output types are never declared on the wiring.** They come from the
  function's own `input:`/`output:` schemas. Route params, query params and body
  are merged into the function's `data` argument.
- **Permissions are never declared on the wiring.** Wire-level permissions were
  removed in #972 — declare them on the function (`pikkuFunc({ permissions })`,
  see `pikku-permissions`) or app-wide via `addGlobalPermission`. Tags and
  patterns now target _middleware_ only.
- **The wire is the third argument**, not a service. `channel`, `rpc`, `session`,
  `setSession`, `mcp`, `queue`, `scheduledTask` and `cli` all live there.

## Import from `#pikku/*`, never `@pikku/core/*`

Every wiring factory has two versions. The generated `#pikku/*` entrypoint binds
it to your project's service, session and middleware types; the `@pikku/core/*`
export is the unbound generic. **Both compile.** Importing from core costs you
exactly the typing that makes the wiring worth having, silently.

`pikku validate` reports it as the `coreImport` lint rule, an error by default,
naming the `#pikku` leaf to use instead. `@pikku/core/services` is the one
subpath it exempts — the service implementations bootstrap picks.

`pikku doc <export>` names each one's `#pikku` leaf on its first line.

## Pick a wiring

| Reach for     | When                                                                                                                                             | Reference                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **HTTP**      | REST endpoints, web APIs, and SSE streams (`sse: true`, `get` only)                                                                              | `references/http.md`; every field in `references/http-options.md`                   |
| **Channel**   | A hand-designed WebSocket protocol with your own action routing                                                                                  | `references/channel.md`                                                             |
| **Realtime**  | Typed pub/sub push — the scaffolded `/events` channel and SSE topics, plus subscribing to any other `sse: true` route or channel from the client | `references/realtime.md`                                                            |
| **RPC**       | One function calling another, or dispatching a name from outside                                                                                 | `references/rpc.md`                                                                 |
| **Queue**     | Reliable background work that must survive a crash and retry                                                                                     | `references/queue.md`                                                               |
| **Scheduler** | Recurring work on a cron expression                                                                                                              | `references/scheduler.md`                                                           |
| **Trigger**   | Reacting in-process to an external event source (Redis pub/sub, PG LISTEN)                                                                       | `references/trigger.md`                                                             |
| **MCP**       | Exposing functions to an AI assistant as tools, resources or prompts                                                                             | `references/mcp.md`                                                                 |
| **CLI**       | A terminal program with commands, subcommands and options                                                                                        | `references/cli.md`; end-to-end walkthrough in `references/cli-complete-example.md` |
| **Gateway**   | An inbound integration from a third-party product — Slack is the shipped adapter                                                                 | `references/gateway-slack.md`                                                       |

Realtime and Channel are the pair most often confused. If the shape is "server
pushes typed events to subscribers", use Realtime — `pikku enable events`
generates the channel, the SSE route and the cleanup for you. Reach for Channel
only when the client also sends structured messages you need to route on.

## What differs, and where it bites

### Each wiring demands a particular function type

| Wiring                         | Function type                        | Why                                            |
| ------------------------------ | ------------------------------------ | ---------------------------------------------- |
| HTTP, Channel, Queue, CLI, MCP | `pikkuFunc` / `pikkuSessionlessFunc` | Ordinary request/response                      |
| Scheduler                      | **`pikkuVoidFunc`**                  | A cron has no input and no caller to return to |
| Trigger _source_               | **`pikkuTriggerFunc`**               | Runs **once at startup**, not once per event   |

A trigger source is the one that surprises people: it sets up a listener, calls
`trigger.invoke(...)` per event, and returns a teardown function. It receives
**singleton services only** — no session, no request, no per-wire services,
because the listener outlives every event it emits.

### Where a session comes from is not uniform

An HTTP or channel caller arrives with credentials and middleware mints a
session. Nothing else does.

- **A cron runs with no session at all.** It cannot invoke a permission- or
  scope-gated RPC, and nothing it writes can be attributed. A scheduled task is a
  machine principal — give it one in the task's own `middleware`, exactly as a
  bearer-authenticated caller gets one. See the machine-auth section of
  `pikku-middleware`.
- **A queue worker and a trigger handler are the same case.** Whatever identity
  they need is minted in middleware, not inherited.
- **A channel authenticates per action.** `setSession` is on the wire, and an
  `auth: false` action (conventionally `authenticate`) is how the session is
  established mid-connection.
- **`auth` on `wireCLI` guards only the generated websocket channel.** A locally
  executed CLI has no connection to authenticate, so it is not a way to require a
  session for local runs.

### Some control-flow calls throw instead of returning

`wire.scheduledTask.skip(reason)` and `wire.queue.discard(reason)` both read like
an early return and are not — they throw, so nothing after the call runs and no
`return` is needed. The consequence lands in middleware: a `try/catch` around
`await next()` catches a skip or a discard and reports it as a failure. If your
middleware distinguishes success from failure, let those pass through rather than
logging them as errors.

### Delivery semantics differ, and that is usually the real choice

| Wiring    | Delivery                                               | Runs where                          |
| --------- | ------------------------------------------------------ | ----------------------------------- |
| Trigger   | **At-most-once**, synchronous                          | In-process, alongside the listener  |
| Queue     | **At-least-once** with retries and a dead-letter queue | Distributed workers                 |
| Scheduler | Depends on the runtime — see below                     | Wherever the scheduler service runs |

Reach for a trigger to react immediately, and a queue when the work must not be
lost. A trigger that must not drop events is a queue with extra steps.

Scheduled tasks are the trap: on serverless runtimes the same `wireScheduler`
declaration behaves three different ways, and the deployment unit rather than the
cron expression can decide which tasks fire. `pikku-deploy` has the comparison.

### Codegen owns several wirings — do not hand-write them

| Turn it on            | Codegen writes                                                   | Never hand-write                                  |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| `pikku enable rpc`    | `rpc-public.gen.ts` — the `POST /rpc/:rpcName` route             | A second route on the same path collides          |
| `pikku enable events` | `events.gen.ts` — the `/events` channel and `GET /events/:topic` | A hand-rolled `/events` misses disconnect cleanup |
| `wireCLI`             | `<program>-channel.gen.ts` — the same commands over a channel    | It is regenerated on every build                  |

Enabling the RPC endpoint says the endpoint exists, not who may call it — each
`expose: true` function is still gated by its own `auth`, permissions and scopes.

## A function nothing uses: wire it or disable it

`pikku verify` fails on an app function that is not wired, exposed, or called
by name (`rpc.invoke`, a workflow step, an agent tool) — `[PKU563]`, naming the
function and its file. `pikku all` still builds; only verify fails. Addon
functions are never flagged, in the addon or in an app that uses it.

Workflows are checked too. A workflow is used when it is wired, exposed, or
started by a literal name: `rpc.startWorkflow('name')`,
`workflowService.startWorkflow` / `runToCompletion('name')`,
`rpc.invoke('name')`, another workflow's step, or a client helper. A workflow
started only through a computed name is flagged.

To keep a function in the source but out of the build, set `disabled`.

A disabled function is left out of everything: meta, RPC maps, clients, MCP,
CLI, HTTP, addon SDKs. It cannot be registered at runtime either. Anything
that still references it — a wiring, an `rpc.invoke('oldReport')`, a workflow
step, an agent tool — fails the build with `[PKU562]`, naming both sides.
`pikku all` lists the disabled functions once, with file and reason.

The value must be `true` or a string literal; a computed value is refused.

## What NOT to do

- Do not import a wiring factory from `@pikku/core/*`. It compiles and silently
  drops your project's types; use the `#pikku/*` entrypoint.
- Do not put `permissions` on a wiring. They were removed in #972 and belong on
  the function.
- Do not declare input or output types on a wiring — they come from the
  function's schemas.
- Do not `return` after `skip()` or `discard()`, and do not let middleware
  report them as failures.
- Do not hand-write `/rpc/:rpcName`, `/events`, or a CLI's channel file.
- Do not reach for a trigger when losing an event matters — use a queue.
- Do not put `sse: true` on anything but a `get`, or `query` on anything but a
  `post`; the config union rejects both rather than failing at runtime.
