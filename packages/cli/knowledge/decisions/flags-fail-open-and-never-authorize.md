---
type: decision
title: Feature flags fail open when unreadable and never gate access, scopes do
description: The flag source falls back to every declared flag on when its store cannot be read, and the runtime uses flags for availability only, leaving access to scopes
tags: cli, flags, auth
---

# Feature flags fail open when unreadable and never gate access, scopes do

`featureFlagsFallback` in `packages/cli/src/functions/wirings/flags/serialize-flags-types.ts` is the
snapshot a flag source uses when its store cannot be read. The doc comment says it turns every declared
flag on, with no rollout and no overrides (`serialize-flags-types.ts:81-84`, `serialize-flags-types.ts:89`).

The comment says failing open is deliberate. A flag store is not an authorization boundary, `scopes` is
(`serialize-flags-types.ts:85-87`).

The runner checks availability only. `assertFeatureAvailable` in
`packages/core/src/wirings/flag/assert-feature-available.ts` does nothing when no source is registered
(`assert-feature-available.ts:24-26`), and its comment says enforcing the capability half would make a
flag a second authorization path (`assert-feature-available.ts:7-17`).

**What this rules out:** using a feature flag as an access check.
