---
'@pikku/core': patch
'@pikku/cli': patch
---

An app developer imports from `#pikku`; reaching past it to `@pikku/core` is the
smell that says the generator is not emitting something it should. Four names
were exactly that. `defineSecret` and `defineScope` already arrived through the
types hub, but `defineCredential` had no definer file at all, `defineVariable`
had one the hub never re-exported, and `cors` — middleware an app wires like any
other — was reachable only from `@pikku/core/middleware`, as was the
`InvalidOriginError` it throws.

The generated `pikkuMiddleware` re-implemented core's rather than delegating to
it, and in doing so dropped `priority`: the config type had no such field, and a
middleware that passed one anyway lost the `__priority` stamp the runtime orders
by. It now delegates, and `MiddlewarePriority` is emitted alongside it.

A `.pikku` written before those definer files existed has a types hub that
predates them, and the hub is only rewritten well after the first inspection —
which needs it, because reading a project's zod schemas imports `#pikku`.
`pikku all` now treats a missing definer file as a reason to bootstrap, which
rebuilds both in order, instead of failing until the directory is deleted by
hand.
