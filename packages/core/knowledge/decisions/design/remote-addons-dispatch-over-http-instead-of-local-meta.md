---
type: decision
title: Remote addons dispatch over HTTP instead of through local function meta
description: wireRemoteAddon ships the addon as a devDependency and posts to the host, so there is deliberately no local handler to resolve
tags: rpc
---

# Remote addons dispatch over HTTP instead of through local function meta

`wireAddon` bundles an addon's functions in-process: the package is a production
dependency and its handlers run inside the consumer. `wireRemoteAddon`
(`packages/core/src/wirings/rpc/wire-remote-addon.ts`) does the opposite — the
package is installed as a **devDependency**, contributing types only, and the
handlers run on the host at `serverUrl`. `pikku verify` enforces the
devDependency placement.

`ContextAwareRPCService.invokeAddonFunction` in `rpc-runner.ts` therefore checks
`resolved.addonConfig?.remote` *before* it looks for local function meta, and
routes to `invokeRemoteAddonFunction`. That method POSTs the addon's own function
name — the bare name, not the namespaced `ns:fn` form, optionally remapped by
`remoteName` — to `${serverUrl}/remote/rpc/:rpcName`, authenticating as a client
with the token bound in `wireRemoteAddon({ auth })`. There is no local meta entry
to fall back on, which is why a missing `serverUrl` raises
`RemoteAddonConfigError` rather than degrading to a local lookup, and a non-2xx
response raises `RemoteAddonRequestError` with a truncated body for context.

**What this rules out:** moving the `remote` check after the local meta lookup
(the lookup will always miss and mask the real error), sending the namespaced
name over the wire, and promoting the addon to a production dependency so its
handlers can be "used directly" — that defeats the point of the remote wiring and
puts the host's code in the consumer's bundle.
