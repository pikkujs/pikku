---
type: decision
title: A browser scenario actor is filled by a persona, and the persona's app picks the URL
description: Each browser actor name resolves to a persona from definePersonas, and that persona's app decides which app URL the session browses
tags: [playwright, actors, personas]
---

# A browser scenario actor is filled by a persona, and the persona's app picks the URL

The header of `packages/playwright/src/config.ts` (lines 8-10) says there are "no personas here", and that identity
"comes from the scenario's own actors, so a browser step and an HTTP step run as the same user".

The same module still records persona routing. `appUrls` is "keyed by the `app` its personas declare" (lines 24-29).

In `packages/playwright/src/provider.ts`, the provider's comment (line 86) says each actor name maps to "the persona
filling it, resolved from `definePersonas()`". A browser actor with no persona is refused with a message that asks for
a `definePersonas` entry (line 263).

`configFor(persona)` (lines 603-605) picks `appUrls[persona.app]` when the persona names an app, and falls back to the
single `appUrl` otherwise. Its doc comment (lines 591-602) says the persona's `app` "is the whole answer".

**What this rules out:** reading a browser step's identity as independent of personas. The actor is a name, and the
persona behind it sets the sign-in and the app.
