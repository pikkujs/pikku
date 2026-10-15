---
type: decision
title: Client-side flag reads are advisory; the server re-checks availability on every call
description: The React feature-flag map decides what to show, and the runner checks flag availability again on each call
tags: [frontend, feature-flags, auth]
---

# Client-side flag reads are advisory; the server re-checks availability on every call

`createFeatureFlags` in `packages/frontend/react/src/feature-flags.ts` fetches the caller's flags once
per session and reads them from memory after (lines 41-46). Its doc comment says the flags are
"Advisory, always" (line 48). "The map is what to show, never what is allowed. The runner re-checks
availability on every call, and authorization was never a flag's job" (lines 48-50).

The runner's side is `assertFeatureAvailable` in `packages/core/src/wirings/flag/assert-feature-available.ts`.
It resolves the flag against the current session and throws `FeatureUnavailableError` when the flag is
not available (lines 18-31). Its own comment (lines 10-12) says it checks availability only, because
enforcing the capability half there "would make a flag a second authorization path".

The interface's `refresh()` (lines 32-37) exists because `capable` depends on the session's scopes, so a
sign-in or sign-out changes what the map should show.

**What this rules out:** using the client-side flag map as an access check. A client that calls a flagged
function anyway is checked by the runner.
