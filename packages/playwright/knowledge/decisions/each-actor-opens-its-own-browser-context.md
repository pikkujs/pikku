---
type: decision
title: Each actor opens its own browser context
description: A new ActorSession gets a fresh Playwright BrowserContext, so one actor's cookies and session never reach another
tags: [playwright, actors, sessions]
---

# Each actor opens its own browser context

`openSession` in `packages/playwright/src/provider.ts` (lines 475-489) builds a new
`ActorSession` for each actor name and calls `open` on it with the shared browser.

`ActorSession` in `packages/playwright/src/actor-session.ts` takes the actor name and
its config in the constructor (lines 165-168). `open` calls `browser.newContext`
(line 176), and that context is stored on the instance (line 176).

`packages/playwright/src/page-screenshots.ts:62` also creates an `ActorSession`, with
the name `anonymous`, so a screenshot run gets its own context too.

The comment at `actor-session.ts:180-182` says Playwright finalises a recording only on
`context.close()`, which is why one context per scenario gives one video per scenario.

**What this rules out:** two actors sharing a context, and so sharing cookies.
