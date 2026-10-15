---
type: decision
title: Each virtual user opens its own browser context
description: A new VirtualUserSession gets a fresh Playwright BrowserContext, so one virtual user's cookies and session never reach another
tags: [playwright, virtual-users, sessions]
---

# Each virtual user opens its own browser context

`openSession` in `packages/playwright/src/provider.ts` (lines 421-460) builds a new
`VirtualUserSession` for each virtual user name and calls `open` on it with the shared
browser.

`VirtualUserSession` in `packages/playwright/src/virtual-user-session.ts` takes the
name and its config in the constructor (line 165). `open` calls `browser.newContext`
and stores that context on the instance (line 176).

`packages/playwright/src/page-screenshots.ts:62` also creates a `VirtualUserSession`,
with the name `anonymous`, so a screenshot run gets its own context too.

The comment at `virtual-user-session.ts:180-182` says Playwright finalises a recording
only on `context.close()`, which is why one context per scenario gives one video per
scenario.

**What this rules out:** two virtual users sharing a context, and so sharing cookies.
