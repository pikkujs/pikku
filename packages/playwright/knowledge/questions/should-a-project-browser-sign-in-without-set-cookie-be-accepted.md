---
type: question
title: Should the Playwright provider accept a project's own browser sign-in that sets no session cookie?
description: The default browser sign-in requires a Set-Cookie, but a signIn the project passes in is awaited and never checked for a session cookie
tags: playwright, auth, sign-in, cookies
---

# Should the Playwright provider accept a project's own browser sign-in that sets no session cookie?

`openSession` in `packages/playwright/src/provider.ts` uses the project's `signIn` option when one is passed, and the provider's own `defaultSignIn` otherwise (line 446). It awaits whichever it chose and returns the session; nothing checks that the context now holds a cookie.

The default branch does check. `defaultSignIn` posts a signed statement and throws when the response has no `Set-Cookie` (`provider.ts:498-503`), before it copies the cookies into the context. The core `statementSignIn` and `inProcessSignIn` throw on the same condition (`packages/core/src/services/virtual-user-sign-in.ts`), and the core note [virtual user sign-in is proven by Set-Cookie](../../../core/knowledge/decisions/security/virtual-user-sign-in-is-proven-by-set-cookie-not-a-non-empty-jar.md) records that rule. So the gap applies only where a project supplies its own `signIn` that returns without error and without planting a cookie.

Open: should the provider require at least one session cookie in the context after a project's own sign-in, the way the default branch does, or is the project's `signIn` returning without error the proof of sign-in?
