---
type: decision
title: The function runner restores the wire fields it overwrites
description: One wire object is reused across nested calls, so functionId, audit, addonNamespace and rpc are saved and put back in a finally
tags: core
---

# The function runner restores the wire fields it overwrites

`runPikkuFunc` in `packages/core/src/function/function-runner.ts` does not build a
fresh wire per call. Nested invocations — an RPC from inside a function, an addon
sibling call, a workflow step — reuse the *same* wire object the outer transport
created. So before it runs, the runner captures `functionId`, `audit`,
`addonNamespace` and the property descriptor for `rpc`, overwrites them for the
duration of this function, and restores or `delete`s them in a `finally`. Both
the middleware path and the direct path carry that restore block. Without it, an
inner call would leave its identity on the wire and every subsequent outer step
would be attributed to the wrong function.

The same reuse is why the audit binding is re-gated inside `executeFunction`
rather than trusted from `createWireServices`. The audit *gate* is per-function
but the `auditLog` wire service is created per-transport-invocation. A nested or
exposed-RPC call would otherwise inherit an `auditLog` built while the outer
wire's audit config was unset (the generated `rpcCaller` declares none), and
every write from the audited inner function would be silently dropped. The runner
compares config identity (`services.auditLog?.config !== resolvedAuditConfig`)
and binds a fresh invocation audit when they differ, then closes it in the
`finally` before wire services are closed.

Authorization order in `executeFunction` is also deliberate: session resolution,
then the auth/readonly checks, then `verifyScopes` — all of which depend only on
the session — and only then `await data()`, schema defaults, coercion, validation
and `runPermissions`. A request denied by scope never pays to parse or validate
its body. `rpc` is installed as a lazily-evaluating accessor that replaces itself
with the resolved value on first read, capturing the *caller's* package name in
the closure so an addon's RPCs resolve in its own namespace.

**What this rules out:** dropping the save/restore blocks as duplicated
boilerplate, or "hoisting" them into a single wrapper that only runs on the
outermost call. It rules out moving `verifyScopes` down next to `runPermissions`
for tidiness — that reintroduces body parsing for denied requests. And it rules
out taking `services.auditLog` at face value when the function declares audit;
the identity check is the only thing distinguishing an inherited disabled
instance from one built for this invocation.
