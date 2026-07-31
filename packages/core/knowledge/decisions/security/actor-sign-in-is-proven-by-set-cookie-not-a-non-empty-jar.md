---
type: decision
title: Actor sign-in is proven by Set-Cookie, not a non-empty jar
description: HttpScenarioActor tracks its own signedIn flag and requires the sign-in response itself to set a cookie, because a populated jar proves nothing
tags: services
---

# Actor sign-in is proven by Set-Cookie, not a non-empty jar

`HttpScenarioActor` (`packages/core/src/services/http-scenario-actors.ts`) keeps
a private `signedIn` boolean rather than inferring the session from its cookie
jar, and `login()` throws when the sign-in response carries no `Set-Cookie`
header even though the response was a 2xx.

A cookie jar cannot answer "did sign-in happen". A target app may set a cookie on
any request — a CSRF token, an anonymous session, a locale — so a non-empty jar
after a failed or skipped sign-in looks exactly like a successful one. What
actually proves a session was established is *this* response setting a cookie. A
2xx alone is not enough either: an endpoint that returns 200 while quietly
declining to issue a session would leave the actor running every subsequent
request unauthenticated, and the scenario would report the resulting refusals as
genuine permission failures.

**What this rules out:** replacing `signedIn` with a `jar.isEmpty()` check,
dropping the `getSetCookie().length === 0` guard as redundant with `res.ok`, and
treating `signOut()` as jar-clearing only — it must reset the flag too, or the
next call proceeds believing it has a session.
