# @pikku/better-auth

Better Auth integration for Pikku — mounts the auth handler, resolves sessions
into Pikku's user session, and maps roles onto scopes.

## Install

```bash
npm install @pikku/better-auth better-auth
```

## Usage

```typescript
import { createAuthHandler, betterAuthSession } from '@pikku/better-auth'

const authHandler = createAuthHandler(auth)
```

Add `betterAuthSession` to your middleware so Pikku functions see the resolved
session, and `withResolvedScopes` to attach scopes for authorization.

## Embedding an app cross-site

`AUTH_COOKIE_CROSS_SITE=true` keeps a session alive when the app runs inside a
third-party iframe, where a `SameSite=Lax` cookie is dropped and sign-in
"succeeds" into an anonymous next request. Set it only in a runtime that embeds
its apps cross-site. A deployed app should leave it unset: it keeps `Lax`
cookies and ignores the relay header entirely.

It turns on two mechanisms, because browsers disagree about which one works:

- every auth cookie becomes `SameSite=None; Secure; Partitioned`, which
  Chromium honours (CHIPS) and WebKit does not implement;
- the auth handler echoes the cookies it just set in
  `x-pikku-cross-site-set-cookie`, and accepts them back in
  `x-pikku-cross-site-cookie` — over storage a third-party frame is allowed to
  use on every engine, including WebKit. `createAuthHandler`,
  `betterAuthSession` and `betterAuthStatelessSession` merge that header into
  `Cookie` before reading the session.

A real cookie always wins over a relayed one of the same name, so a browser
that did store it stays authoritative. Implement the browser half with
`CROSS_SITE_COOKIE_HEADER`, `CROSS_SITE_SET_COOKIE_HEADER` and
`decodeSetCookies` — the echo is a percent-encoded JSON array.

### What it costs, and two rules

In the embedded frame the session lives in JS-readable storage: no `HttpOnly`,
so an XSS is account takeover. That is a fair trade for a development preview
and a real decision for anything else. Weigh it before embedding a production
app in someone else's page.

**Never add `x-pikku-cross-site-cookie` to a permissive CORS allowlist.** A
custom header cannot be sent cross-origin unless the server permits it, which
is the only reason the relay is not a CSRF vector — better-auth's own origin
checks still run, since the merge happens before its handler.

**Add both header names to your log and APM redaction lists.** Every redactor
knows about `Cookie` and `Authorization`; none of them know about these, and
they carry the same credential.

Responses carrying the echo are already sent `Cache-Control: no-store` — caches
special-case `Set-Cookie` and nothing else, and a stored copy would hand one
user's session to the next.

## Docs

https://pikku.dev/docs
