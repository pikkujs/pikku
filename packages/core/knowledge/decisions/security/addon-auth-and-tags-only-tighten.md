---
type: decision
title: Addon auth and tags only tighten, and resolve where the function runs
description: wireAddon auth and tags are applied in runPikkuFunc like scopes, but auth:false is ignored and tags resolve against the consuming app's tag groups rather than the addon package's
tags: addon, auth, tags, authorization
---

# Addon auth and tags only tighten, and resolve where the function runs

`wireAddon({ auth, tags })` was read only by `resolveAddonFunction` in
`rpc-runner.ts`, which covers the `namespace:function` RPC form alone. Every
direct wiring — the inspector writes the addon's package name onto http,
channel, schedule, queue, cli, trigger, gateway and mcp wirings — reached
`runPikkuFunc` with a `packageName` and neither value. That is the same hole
[addon scopes](./addon-scopes-are-resolved-where-the-function-runs.md) had, and
it is closed the same way: `runPikkuFunc` resolves both from the addon config.

`auth` merges as an OR and `auth: false` is ignored. The RPC path treats it as a
default (`addonConfig?.auth ?? options.requiresAuth`) because there the addon
config is the only statement of intent. On a direct wiring the route already
carries its own `auth`, so honouring `false` would let an addon *weaken* a gate
the app wrote — the inverse of what a wiring-level declaration should be able to
do. An addon may require a session the wiring did not; it may never waive one
the wiring did.

Tags resolve against the **root** tag groups, not the addon package's. A tag on
`wireAddon` is written by the consuming app, and `addTagMiddleware('admin', …)`
in that app registers under the root package. `combineMiddleware` looks tag
metadata up under the `packageName` it is given, which for an addon function is
the addon's own namespace — where the app's middleware does not exist. Resolving
addon tags to concrete middleware before the call and passing them as
`wireMiddleware` is what keeps `wireAddon({ tags: ['admin'] })` from being
silently inert, which is the failure mode the whole gate exists to avoid.

A function's own tags are unaffected: the inspector already emits them as
`{ type: 'tag' }` entries on the function and wiring meta, resolved under the
package that declared them. The `tags` argument `runPikkuFunc` accepts is
separate and still unused on every path.

**What this rules out:** honouring `auth: false` from an addon on a direct
wiring; resolving addon tags under the addon's `packageName`; and folding addon
tags into `funcInheritedMiddleware`, which would resolve them in the wrong
namespace and double-apply the function's own tags.
