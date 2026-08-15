---
type: decision
title: Bare RPC names resolve through the caller's package scope before root
description: An addon's own functions win over root RPC meta for bare names, and the resolving scope is returned so it can be threaded into runPikkuFunc
tags: rpc
---

# Bare RPC names resolve through the caller's package scope before root

`resolvePikkuFunction` in `packages/core/src/wirings/rpc/rpc-runner.ts` tries the
caller's package function meta first when a `packageName` is supplied, then root
RPC meta, then a versioned base name, then root function meta, and only then
throws `RPCNotFoundError`. It returns the resolving package alongside the
`pikkuFuncId` so `ContextAwareRPCService` can pass the right scope into
`runPikkuFunc` without a second lookup.

The package-first order exists because RPC meta only ever lives in root: addon
packages register their handlers under their own package name as _function_ meta,
never as RPC meta. Without the package probe, a bare `rpc('doThing')` made from
inside an addon would skip that addon's own `doThing` and either resolve to an
unrelated root function of the same name or fail outright. The versioned retry
exists so `name@2` falls back to the meta registered under `name`.

When even root resolution fails, `rpc` and `rpcWithWire` catch the
`RPCNotFoundError` and hand the call to `services.deploymentService` if one is
configured — a Cloudflare service binding or a Lambda invoke — so a name that is
not in this deploy unit can still be served by another.

**What this rules out:** flattening the lookup to a single root meta read,
resolving the package scope separately from the function id (the two must agree),
and treating an `RPCNotFoundError` as terminal before the deployment-service
fallback has had a chance.
