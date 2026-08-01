---
'@pikku/better-auth': patch
---

Keep a cross-site-embedded app signed in on browsers that refuse third-party cookies.

`AUTH_COOKIE_CROSS_SITE` already rewrote every better-auth cookie to
`SameSite=None; Secure; Partitioned` so a session survives inside a third-party iframe
(the Fabric sandbox preview). That is a Chromium answer: `Partitioned` (CHIPS) is not
implemented in WebKit, which blocks third-party cookie writes outright — and every
browser on iOS is WebKit. On a phone, sign-in returned 200, the browser dropped the
cookie, the next request arrived anonymous and the app bounced back to `/login`.

The same flag now also enables a cookie relay, over storage the embedded frame is
actually allowed to use. The auth handler echoes the cookies it just set in
`x-pikku-cross-site-set-cookie` (JS can never read `Set-Cookie` itself); the client
sends them back in `x-pikku-cross-site-cookie`, and `createAuthHandler`,
`betterAuthSession` and `betterAuthStatelessSession` merge that header into `Cookie`
before reading the session. A real cookie always wins over a relayed one of the same
name, so a browser that did store it stays authoritative.

Both header names, `crossSiteCookies()` and `mergeRelayedCookies()` are exported for
clients that implement the browser half. A response carrying the echo header is marked
`Cache-Control: no-store`: caches along the path know to be careful with `Set-Cookie`
and nothing about this one, and a stored copy would hand one user's session to the next.

Unchanged for everyone else: the relay is honoured only when `AUTH_COOKIE_CROSS_SITE`
is set, which only a runtime that embeds its apps cross-site sets. A deployed app keeps
`SameSite=Lax` cookies and ignores the header entirely.
