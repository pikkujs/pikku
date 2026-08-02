---
type: decision
title: Addon auth and tag gates apply wherever the function runs, including inside the addon
description: wireAddon's auth and tags moved from the namespaced RPC boundary into runPikkuFunc, so they also apply to direct wirings and to bare intra-addon calls
tags: rpc, addon, auth
---

# Addon auth and tag gates apply wherever the function runs, including inside the addon

`ContextAwareRPCService.invokeAddonFunction` used to be the only place that
applied an addon's `addonConfig.auth` and `addonConfig.tags`, making them a
perimeter control on `rpc('namespace:fn')`. That perimeter had a hole in it: the
inspector writes the addon's package name onto http, channel, schedule, queue,
cli, trigger, gateway and mcp wirings, and every one of those runners calls
`runPikkuFunc` directly without resolving a namespace. A consumer who wrote
`wireAddon({ auth: true })` and then wired an addon function to a route got no
gate at all.

Both values now resolve in `runPikkuFunc`, the one point every path shares —
the same move, for the same reason, as
[addon scopes](./addon-scopes-are-resolved-where-the-function-runs.md). See
[addon auth and tags only tighten](./addon-auth-and-tags-only-tighten.md) for
the merge rules.

This replaces a consequence an earlier decision accepted: a bare `rpc('fn')`
made from inside an addon now re-applies the gate, because it reaches
`runPikkuFunc` with the addon's `packageName` like any other call. The earlier
reasoning — that the perimeter had already been passed, so re-checking would
gate internal calls on a consumer-facing setting — held only while the perimeter
was real. Once a direct wiring could enter the addon without passing any gate,
"already inside" stopped being something the runtime could infer, and the choice
became re-checking or trusting an entry that may never have happened.

In practice an intra-addon call inherits the entry point's session, so the auth
check passes wherever the entry was itself authenticated. What it does break is
an addon that wires `auth: true` and also runs its own sessionless internal
work — a scheduled task or queue worker inside the addon calling a sibling. Such
an addon should carry authorization on the function via
`pikkuFunc({ permissions })`, which has always been enforced on every path,
rather than on the consumer-facing `wireAddon` setting.

Re-checking was chosen over provenance because the marker that would make
"already inside" knowable — set by the runtime, unsettable by any caller outside
the process, threaded through all eight runners — is a design problem of its
own, and shipping it inside a security fix would have meant landing an untested
trust signal alongside the gate that depends on it. Adding that marker is
tracked separately; until it exists, re-checking is the only option that does
not trust an entry which may never have happened.

**What this rules out:** treating `addonConfig.auth` as a perimeter-only
control; and inferring "already inside the addon" from the wire, which a direct
wiring does not set.
