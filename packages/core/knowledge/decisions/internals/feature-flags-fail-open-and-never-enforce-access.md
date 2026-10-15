---
type: decision
title: Feature flags fail open on availability and never enforce access
description: A flag with no config row is available by default, anyOf decides only the advisory capable half, and the runner's assertFeatureAvailable checks availability alone
tags: core, flags, authorization
---

# Feature flags fail open on availability and never enforce access

`resolveFlag` in `packages/core/src/wirings/flag/resolve-flag.ts:54-95`
separates two halves. `capable` is true when `anyOf` is absent, and otherwise
comes from `hasAnyScope` on the session's scopes (`:68-69`). If the flag has no
config row, the result is `available: true` (`:72-74`). The doc comment at `:54-59`
says this fail-open is safe only because `capable` comes from the session and
`scopes:` is not changed by a flag.

`FlagState` in `packages/core/src/wirings/flag/flag.types.ts:97-104` says the same
thing: `available` is the only half the runner enforces, and `capable` is advisory
and "protects nothing". `flag.types.ts:14-18` says `anyOf` is an OR over scopes,
deliberately the opposite of `scopes`, which is an AND.

`assertFeatureAvailable` in `packages/core/src/wirings/flag/assert-feature-available.ts`
calls `resolveFlag` and throws only when `available` is false (`:28-30`). It does
nothing when no feature-flag source is registered (`:24-26`). The doc comment at
`:10-12` says enforcing `capable` here would make a second authorization path.

**What this rules out:** using a flag as an access check, and a store outage
turning every flagged feature off.
