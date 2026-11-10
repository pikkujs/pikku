---
name: pikku-services
description: >-
  Pikku service layer: pikkuServices/pikkuWireServices DI, pikkuServerLifecycle, defineSecret, defineVariable, defineCredential, env vars, audit sink, logging. Choosing a service backend is pikku-service-backends.
installGroups: [core]
---

# Pikku Services

For how to call it, run this once: `pikku doc setup secrets variables pikkuServices pikkuWireServices pikkuServerLifecycle defineSecret defineVariable defineCredential`.
This skill is the part the compiler cannot tell you: where a
value is allowed to be read, and what a service's lifetime commits you to.

## Two lifetimes, and that is the whole model

**Singleton services** (`pikkuServices`) are built once at startup and live for
the process. **Wire services** (`pikkuWireServices`) are built fresh per HTTP
request, queue job, channel message or CLI command, and receive the wire.

Everything else follows from that split: a database pool is a singleton, a
request-scoped logger or audit buffer is a wire service, and startup work that
needs the singletons goes in `pikkuServerLifecycle` rather than in a module's
top level.

## Services the runtime injects

`pikku dev` and `pikku serve` build a set of singletons before your
`createSingletonServices` runs and hand them in as `existingServices` — among
them `content`, a `LocalContent` storing files under `.pikku-runtime/content`
and serving them from `/upload` and `/assets`. **You never construct these in
`services.ts`, and their absence from that file is not evidence they are off.**
The optional `content` block in `pikku.config.json` only overrides that
service's paths and size limit; omitting it does not disable it.

## Pick the reference

| You are…                                                                     | Read                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Writing or wiring `services.ts` / `lifecycle.ts`, or adding a custom service | `references/services.md`                                     |
| Reading config — secrets, env vars, or a per-user API credential             | `references/config.md`                                       |
| Recording audit events, or choosing a sink                                   | `references/audit.md` and `references/audit-wire-service.md` |
| Setting up structured logging                                                | `references/pino.md`                                         |
| Choosing what sits behind a core service                                     | `pikku-service-backends`                                     |
| Sending outgoing webhooks to a customer's endpoint                           | `pikku-webhook`                                              |

## Where a value may be read

- **Never `process.env` inside a Pikku function.** Use `services.variables.get()`
  or `services.secrets`. `process.env` belongs to server bootstrap (`start.ts`)
  — and under `pikku dev` / `pikku serve` there is no `start.ts` at all, so
  startup work goes in a `pikkuServerLifecycle` hook, which receives the
  singletons and reads through `variables` too.
- **Never `fs`, `child_process` or `process.argv` in app code either.**
  `pikku validate` reports each of them through the app's oxlint, so a
  function that needs one has the wrong shape:

  | Instead of                                                                             | Use                                                                    | `lint` key                |
  | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
  | `fs`, `node:fs`, `fs/promises`, `fs-extra`                                             | the `content` service (keyed, project-scoped, signed reads and writes) | `enforceContentService`   |
  | `process.env` (also `{ ...process.env }`, `const { env } = process`, `globalThis`/`global`/`self`.process) | `variables` for values, `secrets` for secrets                          | `enforceVariablesService` |
  | `child_process`, `execa`, `cross-spawn`, `shelljs`, `Bun.spawn`, `Bun.$`               | the Supervisor, which owns the process and its output                  | `enforceSupervisor`       |
  | `process.argv`, `Bun.argv`, `Deno.args`, `commander`, `yargs`, `minimist`, `parseArgs` | a `pikku` CLI command, which receives typed input                      | `enforceCliCommands`      |

  Opting out: `start.ts`, `server.ts`, `**/bin/**`, `**/scripts/**` and tests are already
  exempt by the `overrides` entry `pikku enable oxlint` writes. One line
  elsewhere takes a plain comment, `// oxlint-disable-next-line
no-restricted-properties -- why`. These rules apply to apps and addons, not library packages. A whole
  project that is a library or tool (a CLI, a harness that edits a checkout) sets the key to `"off"` in `pikku.config.json`.
  Do not exempt a services directory: the factory is where a service gets its
  value, and it reads `variables` like everything else.

- **`secrets` never reaches a function.** `WiredServices` is wrapped in
  `SecretlessServices<…>`, so it is stripped at the type level rather than merely
  omitted by convention. Read a secret in a service factory or middleware and
  hand the resulting service the value.

## What NOT to do

- **Do not guard a service's existence in a function body.** `if (!db) throw …`
  is dead code. Optionality lives only in the `SingletonServices` declaration and
  means "may not be created" — a service is optional precisely because nothing
  destructures it. The inspector records every service destructured by a wired
  `func`, `permissions` or `middleware` and marks it required, so inside the
  function it is a non-optional value. A genuinely conditional integration is a
  configuration concern: branch in `services.ts` or fail fast at startup.
- **Do not take `services` as a named parameter and cast in the body.** The
  inspector reads the destructuring pattern to build the manifest; a cast makes
  the service invisible to it, so tree-shaking drops what the function needs.
- **Do not cast a service factory.** `pikkuServices(...) as X` (or `as unknown
as`, `!`, `<X>`) hides the call from the inspector,
  so the factory would not be registered; the build fails with `PKU564`
  instead. Export the direct `pikkuServices(...)` / `pikkuWireServices(...)` /
  `pikkuConfig(...)` call and fix the type mismatch the cast was hiding.
  `satisfies` and parentheses are fine: the inspector reads through them.
- **Do not hand-roll an audit table.** `auditLog.write()` on an `audit: true`
  function enriches the event with the function id, wire type, trace id and user
  identity; an `insertInto('audit_log')` of your own gets none of that, and a
  write inside a transaction that later rolls back records nothing.
- **Do not reach for `node:os` (`tmpdir()`, `homedir()`) or hand-roll `mkdtemp`
  to get a scratch file.** `node:os` is missing from some runtimes, so one import fails the whole worker at upload, even if the code path
  never runs there. `TemporaryFileService` (`@pikku/core/services/temporary-file-service`)
  is a **wire service**, not a singleton: build it in `pikkuWireServices` with
  `new TemporaryFileService(singletonServices.logger, tempDir).createInstance()`
  and return the `TemporaryFileInstance`, so each invocation owns its own files.
  Use `writeFile(key, stream)`, `getTempFileAbsolutePath(key)` when a subprocess
  needs a path, and `cleanup()` in a `finally`. Do not construct it in
  `pikkuServices` and close over it in a singleton — pass the instance in per call.
- **Do not log an unrevealed secret.** Every logger argument is `Safe<>`-guarded,
  so a `SecretValue` nested anywhere in the call collapses it to `never` and it
  stops compiling. That is deliberate — it would have printed `[secret]` anyway.
