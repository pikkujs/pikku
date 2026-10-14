---
type: question
title: Should the Playwright provider accept a wired sign-in plugin that sets no session cookie?
description: The default and operator browser sign-in paths require a Set-Cookie, but the wired-plugin branch copies whatever cookies it recorded and never checks that any were set
tags: playwright, auth, sign-in, cookies
---

# Should the Playwright provider accept a wired sign-in plugin that sets no session cookie?

When a project has wired a sign-in factory (`getWiredPersonaSignIn()`), `defaultSignIn` calls the plugin's `login` and then copies the cookies its jar recorded into the browser context (`packages/playwright/src/provider.ts:528-559`). The jar keeps only `Set-Cookie` headers, and it drops a name whose new value is empty (`provider.ts:543-551`). After `await plugin.login(jar, persona)` (`:556`) there is no check that any cookie was recorded. An empty `held` map passes through without error (`:557-559`).

The other two branches do check. The fallback `defaultActorSignIn` throws when the response has no `Set-Cookie` (`provider.ts:642-647`). The operator path goes through `establishOperatorSession`, which throws when there is no session cookie (`packages/core/src/services/persona-sign-in.ts:189-192`).

The standard `ActorSignIn.login` throws on a response with no `Set-Cookie` (`packages/core/src/services/persona-sign-in.ts:109-113`), and the core note [actor sign-in is proven by Set-Cookie](../../../core/knowledge/decisions/security/actor-sign-in-is-proven-by-set-cookie-not-a-non-empty-jar.md) records that rule. So the gap applies only where a project supplies its own plugin whose `login` returns without error and without a cookie.

Open: should the provider require at least one recorded session cookie after a wired login, the way the other two branches do, or is the plugin's own `login` the proof of sign-in?
