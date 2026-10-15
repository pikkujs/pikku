---
type: question
title: Should a session holding the admin root skip the ownership check on a single agent thread?
description: isThreadOwner returns true for any session with the admin scope root before it loads the thread, so admins read any single thread; the comment defends the refusal of a missing thread but not this bypass
tags: console, agents, ownership
---

# Should a session holding the admin root skip the ownership check on a single agent thread?

`isThreadOwner` (`packages/addon/pikku-console/src/functions/is-thread-owner.permission.ts`)
is the permission for a single-thread read. It first checks
`hasScopes([ADMIN_SCOPE_ROOT], session?.scopes)` with `ADMIN_SCOPE_ROOT = 'admin'`
(`is-thread-owner.permission.ts:5`, `:18`), and returns `true` when that holds
(`is-thread-owner.permission.ts:19`). Only otherwise does it load the thread and
call `canAccessThread(thread.resourceId, session)` (`is-thread-owner.permission.ts:21-23`).

The comment explains that ownership is derived from the session because the
`threadId` is caller-supplied, and that a missing thread is refused so it cannot be
told apart from a foreign one (`is-thread-owner.permission.ts:7-14`). It does not
mention the admin bypass.

Open: is the bypass meant to let an administrator open any single thread, and does
it match the thread list, which the console also filters? The code applies it here
without a stated reason.
