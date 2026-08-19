---
type: decision
title: A scaffold flag says a surface exists, not who may call it
description: scaffold.<feature> is boolean | { path } — the auth field is gone, because the function runner already enforces each generated function's own auth, wiring, scopes and addon
tags: config, authorization, codegen, scaffold
---

# A scaffold flag says a surface exists, not who may call it

`scaffold.<feature>` carried an `auth` field, defaulting closed — see
[[scaffold-features-are-authenticated-unless-opted-out]], which this supersedes.
The field is gone. `PikkuScaffoldFeature` is now `boolean | { path?: string }`:
whether the surface is generated, and where the file goes.

The field was a second gate in front of one that already runs. `resolveSession`
in `packages/core/src/function/function-runner.ts` throws `ForbiddenError` for a
`pikkuFunc` with no session, unconditionally; a `pikkuSessionlessFunc` requires
one when its own `auth: true` says so, when its wiring says so, or when
`resolveAddonAuth` does. That is where authentication is decided, per function,
by whoever wrote it. A config flag three directories away could only be coarser
than that, and being coarser was the whole problem the earlier decision was
trying to work around by defaulting it closed.

So the generated dispatchers — public RPC, public agent, workflow routes and the
events channel — emit a fixed `auth: false` on every function and wiring they
write. That is not the scaffold declaring the surface public. It is the
dispatcher declining to gate, because it does not know what it is forwarding to:
`rpcCaller` hands whatever name it was given to `rpc.exposed`, and the function
that resolves there is the one that answers for itself. Omitting the field would
not have been neutral — a wiring with no `auth` requires a session — so the
wrapper would reject the call before the gate that decides ever ran, which is a
harder gate than the config field it replaced, applied by the layer least
qualified to apply it.

The scoped admin surfaces do not emit it. `userAdmin` and `virtualUser` generate
`pikkuFunc` with `scopes: ['admin:users:...']` — session-required by
construction, and the function that decides rather than a wrapper in front of
one. `auth: false` there is refused by `runPikkuFunc` with a warning telling you
to use `pikkuSessionlessFunc` instead, and `auth: true` would only restate the
type.

`pikku enable <feature>` lost its `--noAuth` flag with the field it wrote.

**What this rules out:** reading a scaffold flag as an authorization decision;
gating a surface in the config instead of on the function that answers it; and
letting a generated dispatcher inherit the default `auth: true`, which reads as
"undecided" and behaves as "denied".
