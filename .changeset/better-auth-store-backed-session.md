---
'@pikku/better-auth': patch
---

feat(better-auth): store-backed sessions with a header or cookie transport

`betterAuthStatelessSession` verifies a signed cookie blob, which is why the
package's `cross-site-cookies.ts` rejected better-auth's `bearer()` plugin:
resolving an opaque `session_token` meant a database lookup, and that forces an
app onto `betterAuthSession` and bundles the full better-auth server into every
unit. That reasoning holds only while the session lives in the database.

`betterAuthStoreSession` resolves a session through better-auth's
`secondaryStorage` instead. There the session token IS the store key, so one
`get` yields `{ session, user }` — no database read, and no better-auth server
in the bundle. Because sign-out deletes the store entry, revocation is
immediate, unlike the stateless middleware's cookie cache.

The credential is better-auth's own signed session token, arriving on
`Authorization: Bearer …` or on its session cookie, selectable per app via
`transports`. That distinction is not a preference: a browser cannot set a
header on a top-level navigation, so a server-rendered app has only the cookie,
while a single-page app fetches everything from JavaScript and needs no cookie
at all. Both carry the same value, verified with the same HMAC better-auth signs
it with, so an app carries one path and never two.

Enable better-auth's `bearer()` plugin to obtain the header form — it echoes the
token on `set-auth-token`, which the better-auth clients already read. Because a
header-carried credential is not tied to an origin, this also serves clients a
cookie cannot reach: a third-party preview iframe under WebKit, or a native
client whose webview origin is a custom scheme.

`SessionStore` is deliberately the same `get`/`set`/`delete` triple better-auth
already expects, so one object serves both. `inMemorySessionStore` is included
for tests, and `prefixedSessionStore` namespaces keys so several tenants can
share one backing store — pass the prefixed store to better-auth's
`secondaryStorage` too, so both sides agree on the key.
