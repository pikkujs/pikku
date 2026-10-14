---
type: question
title: Should logout clear more than cookies?
description: ActorSession.logout clears only the context's cookies, so other browser storage in the actor's context survives a logout
tags: [playwright, actors, sessions]
---

# Should logout clear more than cookies?

`ActorSession.logout` in `packages/playwright/src/actor-session.ts` (lines 425-428)
calls `this.context.clearCookies()` and then navigates to `/`. It does not clear
other storage such as local storage or IndexedDB.

The context is one per actor (`packages/playwright/src/actor-session.ts:176`), so any
storage the app writes stays with that actor until the context closes.

Question: is clearing cookies enough to count as signed out for the apps these actors
drive? Nothing in this package says which storage the apps keep their session in.
