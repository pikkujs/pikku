---
type: question
title: What should an impersonated session carry?
description: An impersonated session without a mapSession is just { userId }, dropping the orgId and virtualUser fields a normal session has; nobody has said whether that is intended
tags: better-auth, impersonation, sessions
---

# What should an impersonated session carry?

When impersonation resolves and the app has no `mapSession`,
`resolveImpersonatedSession` returns `{ userId: target }`
(`packages/services/better-auth/src/auth-session-impersonation.ts`). A normal
session from the same middleware carries more: the `orgId` `defaultSession` reads
from the active organization, the `virtualUser` flag `stampVirtualUserFlag` adds,
and whatever `mapSession` adds.

So an impersonated request can behave differently from the same user signing in
directly. The code makes the choice; no comment or note defends it.

Open: should the impersonated session copy the target's `orgId` and `virtualUser`
stamp, or is a bare id intended? Answering it decides whether org-scoped reads
work under impersonation.
