---
type: decision
title: Remote addons dispatch over HTTP instead of through local function meta
description: wireRemoteAddon ships the addon as a devDependency and posts to the host, so there is deliberately no local handler to resolve
tags: rpc
---

# Remote addons dispatch over HTTP instead of through local function meta

`wireAddon` bundles an addon's functions in-process: the package is a production
dependency and its handlers run inside the consumer. `wireRemoteAddon`
(`packages/core/src/wirings/addon/wire-remote-addon.ts`) does the opposite — the
package is installed as a **devDependency**, contributing types only, and the
handlers run on the host at `serverUrl`. `pikku verify` enforces the
devDependency placement.

`ContextAwareRPCService.resolveAddonFunction` in `rpc-runner.ts` therefore checks
`resolved.addonConfig?.remote` _before_ it looks for local function meta, and
`executeAddonFunction` routes the remote call to `invokeRemoteAddonFunction`. That
method POSTs the addon's own function name — the bare name, not the namespaced
`ns:fn` form, optionally remapped by `remoteName` — to the host's public
`${serverUrl}/rpc/:rpcName` route, with the body `{ rpcName, data }` that route
and the generated fetch client already use. It authenticates as a client with
the token bound in `wireRemoteAddon({ auth })`, never on the host's
`/mesh/rpc` route, which only accepts mesh tokens. There is no local meta entry
to fall back on, which is why a missing `serverUrl` raises
`RemoteAddonConfigError` rather than degrading to a local lookup. How a failed
call is reported is in
[remote addon errors are rebuilt, not passed through](../security/remote-addon-errors-are-rebuilt-not-passed-through.md).

**What this rules out:** moving the `remote` check after the local meta lookup
(the lookup will always miss and mask the real error), sending the namespaced
name over the wire, posting to the mesh route, and promoting the addon to a production dependency so its
handlers can be "used directly" — that defeats the point of the remote wiring and
puts the host's code in the consumer's bundle.
