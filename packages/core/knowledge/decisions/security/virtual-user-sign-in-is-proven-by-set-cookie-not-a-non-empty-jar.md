---
type: decision
title: Virtual user sign-in is proven by Set-Cookie, not a non-empty jar
description: HttpVirtualUser tracks its own signedIn flag and both VirtualUserSignIn implementations require the sign-in response itself to set a cookie, because a populated jar proves nothing
tags: services
---

# Virtual user sign-in is proven by Set-Cookie, not a non-empty jar

`HttpVirtualUser` (`packages/core/src/wirings/virtual-user/http-virtual-users.ts`) keeps a
private `signedIn` boolean rather than inferring the session from its cookie
jar. Both `VirtualUserSignIn` implementations in
`packages/core/src/services/virtual-user-sign-in.ts` — `statementSignIn` and
`inProcessSignIn` — throw when the sign-in response carries no `Set-Cookie`
header, even though the response was a 2xx.

A cookie jar cannot answer "did sign-in happen". A target app may set a cookie on
any request — a CSRF token, an anonymous session, a locale — so a non-empty jar
after a failed or skipped sign-in looks exactly like a successful one. What
actually proves a session was established is _this_ response setting a cookie. A
2xx alone is not enough either: an endpoint that returns 200 while quietly
declining to issue a session would leave the virtual user running every subsequent
request unauthenticated, and the scenario would report the resulting refusals as
genuine permission failures.

**What this rules out:** replacing `signedIn` with a `jar.isEmpty()` check,
dropping the `getSetCookie().length === 0` guard as redundant with `res.ok`, and
treating `signOut()` as jar-clearing only — it must reset the flag too, or the
next call proceeds believing it has a session.
