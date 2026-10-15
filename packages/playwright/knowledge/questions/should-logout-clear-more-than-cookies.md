---
type: question
title: Should logout clear more than cookies?
description: VirtualUserSession.logout clears only the context's cookies, so other browser storage in the virtual user's context survives a logout
tags: [playwright, virtual-users, sessions]
---

# Should logout clear more than cookies?

`VirtualUserSession.logout` in `packages/playwright/src/virtual-user-session.ts` (lines 425-428)
calls `this.context.clearCookies()` and then navigates to `/`. It does not clear
other storage such as local storage or IndexedDB.

The context is one per virtual user (`packages/playwright/src/virtual-user-session.ts:176`),
so any storage the app writes stays with that virtual user until the context closes.

Question: is clearing cookies enough to count as signed out for the apps these virtual
users drive? Nothing in this package says which storage the apps keep their session in.
