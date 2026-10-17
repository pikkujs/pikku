---
type: decision
title: Addon scopes are resolved where the function runs
description: wireAddon scopes are merged inside runPikkuFunc rather than at namespace resolution, because most wirings reach an addon function without ever resolving a namespace
tags: addon, scopes, authorization
---

# Addon scopes are resolved where the function runs

`wireAddon({ scopes })` names scopes every function in the addon's package
requires. `runPikkuFunc` calls `resolveAddonScopes(packageName,
addonInstance?.namespace)` and unions the result with the function's own
`scopes` before `verifyScopes`.

The obvious home for this is `resolveAddonFunction` in `rpc-runner.ts`, next to
where `auth` and `tags` are already merged from the addon config — but that
covers only the `namespace:function` RPC form. An addon function is reachable
without any namespace resolution: the inspector's `resolveAddonName` writes the
addon's package name onto the wiring meta whenever a wiring's `func` is an
identifier imported from a wired addon, and every runner (`http-runner`,
`mcp-runner`, channel, scheduler, queue, cli, trigger, gateway) then passes that
`packageName` straight to `runPikkuFunc`. `refHTTP` / `refChannel` / `refCLI`
contracts do the same through `registerHTTPRouteMeta`. A gate at namespace
resolution would leave every one of those doors open while reading as complete,
which is worse than no gate. `runPikkuFunc` is the one point all of them share.

Merging is a union, not an override, because `firstUnsatisfied` in `scopes.ts`
requires every listed scope. An addon scope is therefore an additional
requirement and can only narrow access — an addon can never weaken a function
that declares stricter scopes of its own.

The package is the **function's**, not the wire's. A `ref('namespace:fn')`
route stays the consuming app's — `wireHTTP` records no `packageName` for it, so
the app's middleware runs rather than the addon's — and `runPikkuFunc` only
learns the addon package when `resolveAddonFunctionTarget` resolves the target.
Reading the floor from the wire's package left every such route outside it: the
console's `workflowRunStream` (#1362), public on both the route and the
function, was refused only because `wireHTTPRoutes` happens to record the
package where `wireHTTP` does not. Addon `auth` and `tags` resolve from the same
package for the same reason.

When the caller carries an `addonInstance`, its namespace selects that
instance's scopes exactly. The direct-wiring paths know only a package name, so
`resolveAddonScopes` unions the scopes of every namespace the package is wired
under. One package wired twice with different scopes is rare; taking the
stricter reading keeps the unnamed path from becoming the weak one.

**What this rules out:** gating addon functions in `resolveAddonFunction`,
`resolveNamespace`, or any per-wiring runner; treating addon scopes as a
default that a function's own `scopes` replaces; resolving a package's scopes
by first matching namespace, the way `findAddonNamespaceForPackage` resolves
services; and reusing this for `wireRemoteAddon`, whose functions execute on the
host and are gated there.
