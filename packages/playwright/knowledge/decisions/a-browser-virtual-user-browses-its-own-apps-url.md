---
type: decision
title: A browser scenario name resolves to a declared virtual user, and that virtual user's app picks the URL
description: Each browser session name resolves to a virtual user from defineVirtualUsers, and that virtual user's app decides which app URL the session browses
tags: [playwright, virtual-users]
---

# A browser scenario name resolves to a declared virtual user, and that virtual user's app picks the URL

The header of `packages/playwright/src/config.ts` (lines 8-10) says identity "comes from the scenario's own
virtual users, so a browser step and an HTTP step run as the same user". The module itself declares none.

The same module records per-app routing. `appUrls` is "keyed by the `app` its virtual users declare" (lines 24-29).

In `packages/playwright/src/provider.ts`, the `virtualUsers` option (line 64) maps each name to "the virtual user
filling it, resolved from `defineVirtualUsers()`". A browser session name with no declared virtual user is refused
with a message that asks for a `defineVirtualUsers` entry (line 207).

`configFor(virtualUser)` (lines 522-527) picks `appUrls[virtualUser.app]` when the virtual user names an app, and
falls back to the single `appUrl` otherwise. Its doc comment (lines 510-521) says the virtual user's `app` "is the
whole answer".

**What this rules out:** reading a browser step's identity as independent of the declared virtual users. The
session is a name, and the virtual user behind it sets the sign-in and the app.
