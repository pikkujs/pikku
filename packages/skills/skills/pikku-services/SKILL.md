---
name: pikku-services
description: >-
  Use for the service layer of a Pikku app — dependency injection with pikkuServices and
  pikkuWireServices, startup/shutdown work with pikkuServerLifecycle, configuration through the
  secrets, variables and credentials services, the audit sink and buffer, and structured logging.
  TRIGGER when: code uses pikkuServices/pikkuWireServices/pikkuServerLifecycle, defineSecret,
  defineVariable or defineCredential, user asks about services.ts, lifecycle.ts, dependency
  injection, env vars, secrets, API credentials, audit logging, AuditService, PinoLogger, or a
  built-in service. DO NOT TRIGGER when: user asks about middleware (use pikku-middleware),
  authentication or permissions (use pikku-auth), or a third-party backend such as Redis, S3 or
  MongoDB (use pikku-service-backends).
installGroups: [core]
---

# Pikku Services

Signatures and option keys come from `pikku doc` — run `pikku doc --ai` for the
installed surface. This skill is the part the compiler cannot tell you: where a
value is allowed to be read, and what a service's lifetime commits you to.

## Two lifetimes, and that is the whole model

**Singleton services** (`pikkuServices`) are built once at startup and live for
the process. **Wire services** (`pikkuWireServices`) are built fresh per HTTP
request, queue job, channel message or CLI command, and receive the wire.

Everything else follows from that split: a database pool is a singleton, a
request-scoped logger or audit buffer is a wire service, and startup work that
needs the singletons goes in `pikkuServerLifecycle` rather than in a module's
top level.

## Pick the reference

| You are…                                                                     | Read                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Writing or wiring `services.ts` / `lifecycle.ts`, or adding a custom service | `references/services.md`                                     |
| Reading config — secrets, env vars, or a per-user API credential             | `references/config.md`                                       |
| Recording audit events, or choosing a sink                                   | `references/audit.md` and `references/audit-wire-service.md` |
| Setting up structured logging                                                | `references/pino.md`                                         |
| Reaching for Redis, S3, SQS, MongoDB or a schema backend                     | `pikku-service-backends`                                     |
| Sending outgoing webhooks to a customer's endpoint                           | `pikku-webhook`                                              |

## Where a value may be read

- **Never `process.env` inside a Pikku function.** Use `services.variables.get()`
  or `services.secrets`. `process.env` belongs to server bootstrap (`start.ts`)
  — and under `pikku dev` / `pikku serve` there is no `start.ts` at all, so
  startup work goes in a `pikkuServerLifecycle` hook, which receives the
  singletons and reads through `variables` too.
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
- **Do not hand-roll an audit table.** `auditLog.write()` on an `audit: true`
  function enriches the event with the function id, wire type, trace id and user
  identity; an `insertInto('audit_log')` of your own gets none of that, and a
  write inside a transaction that later rolls back records nothing.
- **Do not log an unrevealed secret.** Every logger argument is `Safe<>`-guarded,
  so a `SecretValue` nested anywhere in the call collapses it to `never` and it
  stops compiling. That is deliberate — it would have printed `[secret]` anyway.
