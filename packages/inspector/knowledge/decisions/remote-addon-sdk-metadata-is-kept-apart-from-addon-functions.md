---
type: decision
title: A versioned remote addon's SDK metadata is kept apart from addonFunctions
description: The functions meta of a synced SDK loads into state.remoteAddonFunctions, never addonFunctions, and only when the SDK matches pikku-addons.lock
tags: inspector, addons, remote, state
---

# A versioned remote addon's SDK metadata is kept apart from addonFunctions

`loadAddonFunctionsMeta` (`packages/inspector/src/utils/load-addon-functions-meta.ts`,
ported in `packages/inspector-go/internal/visit/addon_load.go`) reads
`function/pikku-functions-meta.gen.json` from a versioned `wireRemoteAddon`'s
SDK into `state.remoteAddonFunctions[namespace]`.

`addonFunctions` means "functions this deployment runs": the deploy analyzer,
services aggregation and the filter all read it that way. A remote addon's
functions run on its host, so mixing them in would bundle and register code
that is not there.

The meta is loaded only when `checkLockedSdk` agrees with the lock; a stale SDK
loads nothing and post-process reports PKU338 instead. The field is serialized
only when set, so a project without versioned remote addons produces the same
state as before.

**What this rules out:** a remote function counted as local, and types or meta
read from an SDK the lock does not vouch for.
