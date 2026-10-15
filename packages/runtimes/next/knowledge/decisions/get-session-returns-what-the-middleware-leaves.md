---
type: decision
title: getSession returns whatever the middleware leaves in the session
description: The Next.js getSession helper runs the given middleware and returns the stored session with no check of its own
tags: [next, auth, session]
---

# getSession returns whatever the middleware leaves in the session

`getSession` in `packages/runtimes/next/src/pikku-session.ts` builds a
`PikkuSessionService` over the singleton session store (lines 24-26). It runs the
middleware passed in (lines 27-34). It then returns `userSession.get()` (line 35).

The doc comment says the session is retrieved "via the middleware provided"
(lines 11-17). The function has no check of its own. Whether a session exists, and
what it contains, is decided entirely by that middleware.

**What this rules out:** a session check inside `getSession` that runs after the
middleware. The auth decision is the middleware's.
