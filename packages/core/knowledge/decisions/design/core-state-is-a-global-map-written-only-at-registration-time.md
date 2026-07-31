---
type: decision
title: Pikku state is a global map written only at registration time
description: A symbol-keyed globalThis map holds the wiring registry; nothing per-request may ever be written to it
tags: core
---

# Pikku state is a global map written only at registration time

`packages/core/src/pikku-state.ts` keeps every registry Pikku has —
functions, HTTP routes, channels, schedulers, queues, workflows, triggers, MCP
tools, agents, gateways, CLI programs, middleware groups, permissions, schemas
and error definitions — in a single `Map<string, PikkuPackageState>` hung off
`globalThis` under `Symbol('@pikku/core/state')`. `pikkuState(packageName, type,
content, value?)` is the only accessor; `PikkuPackageState` in
`packages/core/src/types/state.types.ts` is its shape.

It is on `globalThis` rather than in a module-level `const` because a bundled
app can end up with more than one copy of `@pikku/core` in the module graph
(workspace links, addon packages that depend on their own core, a runtime
adapter pulling a second instance). Module-level state would give each copy its
own empty registry and functions would go missing at call time; a symbol on the
realm global is shared by every copy in that realm. The package-name dimension
is what keeps addon registries from colliding with the host project's.

Everything written here is written **once, at import time**, by `wireHTTP`,
`addFunction`, `addTagMiddleware`, `addError`, `addSchema` and friends — that is,
by the top-level side effects of the generated and user modules. It is
registration data, not request data. Pikku must stay stateless and
serverless-compatible: the same process serves concurrent invocations on Lambda,
Workers and multi-instance containers, and nothing in a request may outlive it.
The file reads like a violation of that rule until you know the writes are all
registration-time. The one exception is deliberate and narrow:
`resetPikkuState()` preserves the `misc.errors` map across a reset, because error
definitions are registered by module-import side effects that will not re-run.

**What this rules out:** using `pikkuState` as a convenient place to stash
anything derived from an invocation — a session, a request-scoped cache, a
pending workflow, a "current user". Any such write is shared across every
concurrent request in the process and lost entirely on the next cold start. It
also rules out replacing the `globalThis` symbol with a module-scoped `Map` "for
cleanliness", and rules out making the state per-request (an `AsyncLocalStorage`
context, say) — the registry is read on hot paths by the function runner and the
routers, and it must be identical for every caller.
