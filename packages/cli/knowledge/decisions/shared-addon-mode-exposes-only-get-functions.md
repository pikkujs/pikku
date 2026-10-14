---
type: decision
title: A shared-secret addon exposes only its GET functions to callers
description: install-addon exposes every function in per-user modes, but in shared mode only the functions whose body calls the GET method, and writes auth true into the wiring file
tags: cli, addons, auth
---

# A shared-secret addon exposes only its GET functions to callers

`exposedFunctions` in `packages/cli/src/functions/commands/install-addon.ts` returns every
function for a per-user install (`install-addon.ts:72-74`). For a shared install it keeps only
functions whose generated body matches `.call("GET"` (`install-addon.ts:75`). The doc comment
gives the reason: a shared secret acts with one identity for everyone, so only reads are
exposed (`install-addon.ts:67-71`).

`wireAddonFile` writes `auth: true` and the computed list into the wiring file
(`install-addon.ts:91-95`). An empty list is written as `false` (`install-addon.ts:86-88`).

**What this rules out:** exposing a mutating addon function to callers in shared mode.
