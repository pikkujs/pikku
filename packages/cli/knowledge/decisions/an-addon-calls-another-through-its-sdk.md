---
type: decision
title: An addon calls another addon through that addon's SDK, read in place when it is in the workspace
description: pikku all in an addon resolves each pikku.uses dependency to an SDK, a workspace package's own .pikku/sdk or a registry SDK pinned in pikku-addons.lock, and merges it into the internal RPC and workflow maps under its alias; the app checks the wired version against the range (PKU354)
tags: [cli, addon, sdk]
---

# An addon calls another addon through that addon's SDK, read in place when it is in the workspace

An addon that declares `pikku.uses: { stripe: '@acme/addon-stripe@^0.12.0' }`
calls `rpc.invoke('stripe:charge')` typed, with no cast
(`utils/addon-dependencies.ts`).

**Where the types come from.** `resolveAddonDependencies` follows the
`node_modules/<package>` link. When its real path has no `node_modules`
segment the package is in this workspace, and its SDK is read where it was
generated, `<package>/<outDir>/sdk`. Anything else becomes a registry spec
merged into `runAddonSync` (`utils/remote-addon-sync.ts`), downloaded and
pinned in `pikku-addons.lock` exactly as a versioned `wireRemoteAddon` is. One
package asked for at two ranges is PKU353, as it is for two wirings.

- A workspace SDK that is missing is PKU338: run `pikku all` in it first.
- One whose version the range refuses is PKU354.

**Why the SDK and not the package's internal map.** The SDK is the remote
surface only, the same files a `wireRemoteAddon` consumer reads. Typing against
it means the addon compiles against what every app can give it, whether that
app wires the dependency locally or remotely. Typing against the internal map
would let it call functions a remote host refuses.

**Why only the internal RPC map and the workflow map.**
`withAddonDependencies` merges the aliases into the maps the addon's own code
reads (`pikku-command-rpc-map.ts`, `pikku-command-workflow.ts`). The exposed
map and the addon's SDK do not get them: an addon's dependencies are not part of
its own published surface. A wiring keeps its name over an alias, and an app
(no `addon` in config) merges nothing.

**Why the version check runs in the app.** The addon pins a range, but the app
picks the instance. `checkAddonDependencyVersions` runs as an `all` step after
the RPC maps. It compares the range with the version the app runs:

- for a versioned `wireRemoteAddon`, the version `pikku-addons.lock` pins;
- otherwise the installed package.json.

An unreadable version fails: "unknown" is not a yes. Mappings the inspector
already refuses (PKU347/348/355) are skipped so each problem is reported once.

**What this rules out:** `(rpc.startWorkflow as Function)(...)` and hand-written
invoke wrappers in an addon; an addon built against one contract running against
another; and a workspace addon needing a publish before its neighbour can call
it.
