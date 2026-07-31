---
type: decision
title: Addon singleton services are cached per namespace, not per package
description: Each wireAddon instance gets its own services built from its own overrides, at the cost of one service graph per wired instance
tags: rpc
---

# Addon singleton services are cached per namespace, not per package

`getOrCreatePackageSingletonServices` in
`packages/core/src/wirings/rpc/addon-runner.ts` keys its `pikkuState` cache on
`addonInstance?.namespace ?? packageName`. The namespace is the consumer-facing
name given to `wireAddon`/`wireRemoteAddon`, and it is what selects the
instance's `secretOverrides`, `variableOverrides` and `credentialOverrides`.

One package may be wired twice — the same payments addon against a live and a
sandbox account, say — with different secret and variable names. Caching by
package name would build the service graph once, from whichever instance called
first, and silently hand the other instance the wrong credentials. Because the
overrides have to be visible to the addon's *own* `createSingletonServices`, they
are applied by wrapping the parent `secrets` and `variables` services
(`aliasSecretService`, `aliasVariablesService`) so that every logical name the
addon reads is remapped to the real project name before resolution. A call with
no instance attached still falls back to per-package caching.

`addonInstanceForNamespace` rebuilds this descriptor for bare intra-addon calls
from the namespace currently executing on the wire, and returns `undefined`
unless that namespace maps to the package being resolved — so a bare call cannot
pick up another instance's overrides.

**What this rules out:** simplifying the cache key to `packageName`, resolving
overrides at the call site instead of aliasing the resolver services, and
assuming two `wireAddon` entries for one package share a service instance.
