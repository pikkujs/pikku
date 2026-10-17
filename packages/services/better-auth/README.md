# @pikku/better-auth

Better Auth integration for Pikku. It mounts the auth handler, resolves
sessions into Pikku's user session with scopes from your `ScopeService`, and
ships the plugins Pikku's console, scenarios and credentials rely on.

## Install

```bash
npm install @pikku/better-auth better-auth
```

## Usage

Define the instance once with `pikkuBetterAuth`. The CLI reads it and generates
the catch-all `/api/auth/**` route (`createAuthHandler()`), the session
middleware and a `defineSecret` for `BETTER_AUTH_SECRET`:

```typescript
import { betterAuth } from 'better-auth'
import { pikkuBan } from '@pikku/better-auth'
import { pikkuBetterAuth } from '#pikku/auth'

export const auth = pikkuBetterAuth(async ({ secrets, kysely }) =>
  betterAuth({
    secret: (await secrets.getSecret('BETTER_AUTH_SECRET')).reveal(),
    database: { db: kysely, type: 'sqlite' },
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true } },
    plugins: [pikkuBan()],
  })
)
```

`createAuthHandler()` takes no arguments; it reads `services.auth`.

### Session middleware

Every middleware maps the better-auth session to `{ userId, orgId? }` (or your
`mapSession`), stamps `virtualUser`, resolves scopes through the registered
`ScopeService` (`withResolvedScopes`), and stands down when an earlier
middleware already set a session. Pick one:

| Middleware                          | Reads                               | Bundles the server | Sees a revocation             |
| ----------------------------------- | ----------------------------------- | ------------------ | ----------------------------- |
| `betterAuthSession()`               | the database, via `services.auth()` | yes                | immediately                   |
| `betterAuthStatelessSession()`      | the signed `session_data` cookie    | no                 | when the cookie cache expires |
| `betterAuthStoreSession({ store })` | better-auth's `secondaryStorage`    | no                 | immediately                   |

The CLI generates the first or the second, depending on `session.cookieCache`.
Register your own globally to pass options. The stateless middleware has to be
told any custom `advanced.cookiePrefix` and `cookieCache.version`, because it
never builds the instance that holds them:

```typescript
betterAuthStatelessSession({
  cookiePrefix: 'my-app',
  cookieCache: { version: '2' },
})
```

The store middleware takes the same storage you hand better-auth.
`inMemorySessionStore()` and `prefixedSessionStore()` build one, and your own
only has to implement `AuthSessionStorage`, which is better-auth's
`SecondaryStorage` contract.

Outside a pikku function, `getAuthSession(auth, request, createConfig,
createSingletonServices)` reads the session and builds a factory's services
and instance only once.

### Plugins

- `pikkuBan()` adds the ban columns and refuses a banned user a session.
- `pikkuVirtualUser()` lets scenarios sign in as virtual users.
- `pikkuCredentialOAuth()` links OAuth2 API credentials to a user, or to the
  reserved platform user for `type: 'singleton'`.
- `pikkuDelegatedAuth()` uses an upstream API as the identity provider. It does
  not link to an existing local user by email unless you opt in with
  `linkExistingUsersByEmail`.

User administration (`createAuthUser`, `setAuthUserBanned`,
`setAuthUserPassword`, `deleteAuthUser`, `revokeAuthUserSessions`,
`sendAuthUserSignInLink`) is plain calls against the internal adapter. The scope
on the function calling them decides who may.

The full guide is the `pikku-auth` skill (`references/better-auth.md`).

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
  use on every engine, including WebKit. Every place this package hands caller
  headers to better-auth merges that header into `Cookie` first:
  `createAuthHandler`, all three session middlewares and `getAuthSession`.

A real cookie always wins over a relayed one of the same name, so a browser
that did store it stays authoritative. Implement the browser half with
`CROSS_SITE_COOKIE_HEADER`, `CROSS_SITE_SET_COOKIE_HEADER` and
`decodeSetCookies` — the echo is a percent-encoded JSON array.

### Same-origin API, third-party frame

The supported shape is an app whose API is on its _own_ origin, embedded in
someone else's page: cross-**site** relative to the top-level document, which is
what `SameSite` reacts to, but same-origin for the app's own `fetch` calls, so
CORS never enters it.

If the embedded app instead calls an API on another origin, the relay needs both
halves of CORS opened deliberately: `x-pikku-cross-site-cookie` in
`Access-Control-Allow-Headers` (or the preflight fails) and
`x-pikku-cross-site-set-cookie` in `Access-Control-Expose-Headers` (or the
client cannot read the echo at all). `cors()` from `@pikku/core/middleware`
takes both:

```typescript
cors({
  origin: ['https://preview.example.com'],
  credentials: true,
  headers: ['Content-Type', 'Authorization', 'x-pikku-cross-site-cookie'],
  exposeHeaders: ['x-pikku-cross-site-set-cookie'],
})
```

Name the origins. Reflecting whatever asked (`origin: true`) hands the relay to
any page that wants it.

### What it costs, and three rules

In the embedded frame the session lives in JS-readable storage: no `HttpOnly`,
so an XSS is account takeover. That is a fair trade for a development preview
and a real decision for anything else. Weigh it before embedding a production
app in someone else's page.

**Never widen CORS to fit the relay in.** A forged `x-pikku-cross-site-cookie`
is inert — it carries no valid signed token, so the relay is not itself a CSRF
vector — but a permissive allowlist reached for on its account is one, and
better-auth's origin checks are what stands behind it (they still run: the merge
happens before its handler).

**Sign-out is the client's to finish.** Deleting a cookie cannot reach the
client's own storage, so a client implementing the relay must drop the entries
the sign-out response expires. It matters most under
`betterAuthStatelessSession`, where a kept-around cache blob keeps verifying
until it ages out.

**Add both header names to your log and APM redaction lists.** Every redactor
knows about `Cookie` and `Authorization`; none of them know about these, and
they carry the same credential.

Responses carrying the echo are already sent `Cache-Control: no-store` — caches
special-case `Set-Cookie` and nothing else, and a stored copy would hand one
user's session to the next.

## Docs

https://pikku.dev/docs
