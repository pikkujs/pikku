---
type: decision
title: A live session is checked before a session middleware resolves one
description: The middlewares read the session the chain has set so far, not the wire snapshot, so an earlier middleware's session is never overwritten by the default mapping
tags: better-auth, session, middleware
---

# A live session is checked before a session middleware resolves one

The wire's `session` property is a snapshot taken when the wire is built. A
`setInitialSession` call from an earlier middleware writes the session service and does
not update that snapshot. A middleware that reads the snapshot therefore sees no
session, resolves its own, and overwrites the one already set.

All three better-auth middlewares (`betterAuthSession`,
`betterAuthStatelessSession` and `betterAuthStoreSession`) avoid this through
the shared `hasLiveSession` in `resolve-session.ts`, which reads
`wire.session || await wire.getSession?.()` and stands the middleware down when
either is set. The original failure was an app's own role-enriching
`betterAuthSession` being clobbered by the CLI's default-map registration.

`betterAuthStoreSession` used to check only the snapshot. It now goes through
the same helper, along with the rest of the shared tail (impersonation, the
default mapping, the `virtualUser` stamp and scope resolution), so the three
cannot drift apart again.

**What this rules out:** deciding "no session yet" from the wire snapshot in a
middleware that can run after another one has authenticated the request.
