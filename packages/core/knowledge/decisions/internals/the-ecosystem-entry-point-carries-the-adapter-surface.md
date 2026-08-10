---
type: decision
title: The ecosystem entry point carries the adapter surface, so the root can promise stability
description: runPikkuFunc and the singleton-service accessors are what a runtime adapter reaches for; their signatures move, and the package root should not promise otherwise
tags: core, api
---

# The ecosystem entry point carries the adapter surface

`@pikku/core` has two kinds of consumer. An **application** writes functions and
wires them: `pikkuFunc`, `wireHTTP`, `PikkuWire`, the error catalogue. A
**runtime adapter** — the express, fastify, uWS, Next, Cloudflare and Lambda
packages, plus tests — reaches past that to drive the runner itself.

Those two surfaces have measurably different stability. Over the nine months
since `PikkuWire` was introduced, its app-facing shape took 22 additions and
**zero removals** — every original field is still there. Over the same period
`runPikkuFunc` was reshaped: `allServices`/`getAllServices` became
`singletonServices`/`createWireServices`, the positional arguments became a
`wireType`/`wireId` pair plus an options object, and `session` became `auth`.

Both were exported from the package root. A compatibility promise made there
would therefore have been a promise about the weaker of the two.

So the adapter surface moved to `@pikku/core/ecosystem`: `runPikkuFunc`, the
singleton-service accessors, and the registration calls the code generator emits
— `addFunction`, `addGlobalMiddleware`, `addMiddleware` — alongside `pikkuState`
and `httpRouter`, which were already separated for the same reason. The wire
runners (`runQueueJob`, `runScheduledTask`, `runCLICommand`, `runMCP*`) left the
root too, but for a different reason: they already lived on their wire subpaths,
which is where every runtime package imports them from, so the root copies were
redundant. 108 runtime exports became 95.

**The name took two attempts.** Not `/internal`: the generated bootstrap
imports from here, so the specifier appears in the user's own `.pikku`
directory, and telling someone they are touching internals when the code
generator put it there is both wrong and self-defeating — it could never be
broken anyway. Not `/runtime` either: that reads as runtime-versus-compile-time,
i.e. _the real API_, which is the opposite of the intended signal, and
`packages/runtimes/*` already claims the word while `packages/cli` is the
largest consumer here at 22 files.

`/ecosystem` says the true thing: you are building a package in the Pikku
ecosystem — a runtime, a service, an addon, the CLI. `/internal` remains as an
alias to the same module because the pinned bootstrap CLI still emits it.

Nothing was deleted. What stayed public is what applications actually
hand-write: `addTagMiddleware` (8 files), `addGlobalPermission`, `fetch` (31),
`wireAddon`, and the authoring helpers.

**What this rules out:** re-exporting anything from `/internal` at the package
root for convenience. The split is the whole point — `/internal` may change in
any release, and the root may not. It also rules out treating `/internal` as
private: it is a published entry point that runtime authors are expected to use,
just without the compatibility guarantee.

`public-surface.json` pins both, so moving a symbol across the line is a visible
diff rather than an accident.
