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

`betterAuthSession` avoids this. Its comment in `auth-session.ts` names the
failure: an app's own role-enriching `betterAuthSession` gets clobbered with the
default map. It reads `getSession ? getSession() : wire.session`, and stands down
when a session already exists.

`betterAuthStatelessSession` does the same check: `session || getSession?.()`.

`betterAuthStoreSession` checks only the snapshot (`!http?.request || !setInitialSession
|| session`). It does not call `getSession`, so it does not get this protection
in the same form. See
[the store middleware question](../../../../core/knowledge/questions/does-the-store-session-match-the-other-two.md).

**What this rules out:** deciding "no session yet" from the wire snapshot in a
middleware that can run after another one has authenticated the request.
