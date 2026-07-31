---
type: decision
title: Addon auth and tag gates apply only at the namespaced RPC boundary
description: wireAddon's auth and tags are enforced on `ns:fn` calls, not on bare calls made inside the addon
tags: rpc
---

# Addon auth and tag gates apply only at the namespaced RPC boundary

`ContextAwareRPCService.invokeAddonFunction` in
`packages/core/src/wirings/rpc/rpc-runner.ts` is the only place that applies an
addon's `addonConfig.auth` and `addonConfig.tags` — the values the consumer set
in `wireAddon`. They are the external gate on `rpc('namespace:fn')`.

A bare `rpc('fn')` made from inside an addon takes the other path in
`ContextAwareRPCService.rpc`, resolving through `resolvePikkuFunction` with the
caller's package scope, and deliberately does **not** re-apply those gates. The
consumer's `auth` setting describes who may enter the addon from outside; once
execution is already inside the addon, the gate has been passed and re-checking
it would break intra-addon calls that legitimately run under an internal
identity.

The consequence is the thing to hold on to: `addonConfig.auth` is a perimeter
control, not a per-function one. Any addon function reachable by a bare name from
another addon function inherits whatever auth the entry point established. An
addon function that needs its own authorization must declare it on the function
itself via `pikkuFunc({ permissions })`, which `runPikkuFunc` enforces on every
path.

**What this rules out:** relying on `wireAddon({ auth: true })` to protect an
individual addon function, and "fixing the inconsistency" by applying
`addonConfig.auth`/`tags` in the bare-name branch — that would gate internal
calls on a consumer-facing setting they were never meant to see.
