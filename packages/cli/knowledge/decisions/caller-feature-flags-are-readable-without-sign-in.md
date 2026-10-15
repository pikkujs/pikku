---
type: decision
title: Feature flags for the caller are readable without sign-in and scoped flags follow the session
description: The generated featureFlagsForCaller function is auth false and resolves against the request's session, so a scoped flag is withheld from a caller who lacks its scope
tags: cli, flags, auth
---

# Feature flags for the caller are readable without sign-in and scoped flags follow the session

The generated `featureFlagsForCaller` in
`packages/cli/src/functions/wirings/flags/serialize-feature-flags-scaffold.ts` is `auth: false`
(`serialize-feature-flags-scaffold.ts:50`). It reads the session from the wire
(`serialize-feature-flags-scaffold.ts:53`).

The comment gives the reasons. Availability falls back to the compiled declaration when no store is
wired, so clients do not hide every flagged feature. The comment also says `anyOf` is still read off
the session, so a scoped flag is not given to a caller who cannot hold it
(`serialize-feature-flags-scaffold.ts:54-58`). The function returns booleans, not the two halves of a
flag's state (`serialize-feature-flags-scaffold.ts:42-44`).

**What this rules out:** returning a scoped flag to a caller whose session lacks its `anyOf` scope.
