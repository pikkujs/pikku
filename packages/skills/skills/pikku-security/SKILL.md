---
name: pikku-security
description: >-
  Use when adding authentication or session management to a Pikku app — pikkuAuth, session
  lifecycle (setSession/clearSession), built-in auth strategies (authBearer, authCookie,
  authAPIKey), or JWT setup. TRIGGER when: user asks about login, logout, session, bearer tokens,
  cookie auth, API keys, or JWT. DO NOT TRIGGER when: user asks about middleware (use
  pikku-middleware), permissions/authorization checks (use pikku-permissions), or secrets/env vars
  (use pikku-config).
installGroups: [core]
---

# Pikku Security (Authentication & Sessions)

## Agent Operating Procedure

1. Discover before editing. Run `pikku info middleware --verbose` and `pikku info functions --verbose` to understand existing auth setup.
2. Auth strategies live in wirings files — do not put `addHTTPMiddleware` calls inside function bodies.
3. Validate with `pikku all --tsc` after changes — it regenerates and then type-checks in one pass, and fails on type errors. Use `--tsc-summary` for a compact one-line-per-error report.

For **middleware** (including tag middleware and service-to-service bearer auth) see `pikku-middleware`.
For **permissions** (pikkuPermission, pikkuAuth, per-function authorization) see `pikku-permissions`.

## Session Management

`session`, `setSession` and `clearSession` live on the **wire** — the function's
third argument — not on services. `setSession`/`clearSession` may be async
(cookie and session-store backends write on the way out), so await them.

```typescript
// Read session in pikkuFunc (session guaranteed to exist)
const getProfile = pikkuFunc({
  func: async ({ db }, _data, { session }) => {
    return await db.getUser(session.userId)
  },
})

// Set session (e.g., after login)
const login = pikkuFunc({
  auth: false,
  func: async ({ jwt, db }, { email, password }, { setSession }) => {
    const user = await db.verifyCredentials(email, password)
    await setSession({ userId: user.id })
    return { token: jwt.sign({ userId: user.id }) }
  },
})

// Clear session (logout)
const logout = pikkuFunc({
  func: async ({}, _data, { clearSession }) => {
    await clearSession()
  },
})
```

`login` is `auth: false` because the caller has no session yet — a `pikkuFunc`
with the default `auth` would be rejected before its body ever ran.

## Built-in Auth Strategies

Apply these via `addHTTPMiddleware` in a wirings file:

```typescript
import { authBearer, authCookie, authAPIKey } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '#pikku/http'

// JWT bearer token — reads Authorization header
addHTTPMiddleware('*', [authBearer()])

// Cookie-based sessions — re-issues the cookie when the session changes
addHTTPMiddleware('*', [
  authCookie({
    name: 'session',
    expiresIn: { value: 30, unit: 'day' },
    options: { sameSite: 'strict' },
  }),
])

// API key — from x-api-key header or ?apiKey= query param
addHTTPMiddleware('*', [authAPIKey({ source: 'all' })])
```

All three share the same escape hatch: they do nothing when there is no HTTP
request, or when a session is already set. That is what lets you stack several —
whichever runs first and finds a credential wins, and the rest step aside — and
it is also why none of them authenticate a queue job, a scheduled task or a
channel message. Those need a session set another way.

Each decodes its credential with the `jwt` service; without one registered, they
silently authenticate nobody.

**`authBearer` in static-token mode.** Passing `token` switches it from decoding
a JWT to comparing (in constant time) against a fixed value — the shape to use
for a service-to-service caller or a demo:

```typescript
authBearer({
  token: {
    secretId: 'AGENT_DEMO_TOKEN', // or: value: 'literal-token'
    userSession: { userId: 'demo-user' },
  },
})
```

An unset secret leaves the middleware inert rather than erroring, so a template
that ships this is safe until someone provides the secret. A malformed
`Authorization` header (no `Bearer ` scheme) throws `InvalidSessionError` in
either mode.

**`authCookie` options.** `name`, `expiresIn` and `options` are all part of the
config; `options` merges over the defaults `{ httpOnly: true, secure: true,
sameSite: 'lax', path: '/' }`, so only override what you need. The cookie is
re-issued after the request only when the session actually changed, which is how
a rolling session extends itself without writing a `Set-Cookie` on every
response.

## Complete Example

```typescript
// permissions.ts
import { pikkuAuth, pikkuPermission } from '#pikku/function'

export const isAuthenticated = pikkuAuth(
  async (_services, session) => !!session
)
export const isVerified = pikkuAuth(
  async (_services, session) => !!session?.emailVerified
)

// wirings/auth.wiring.ts
import { authCookie } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '#pikku/http'

addHTTPMiddleware('*', [
  authCookie({
    name: 'session',
    expiresIn: { value: 30, unit: 'day' },
    options: {},
  }),
])

// functions/auth.functions.ts
export const login = pikkuFunc({
  auth: false,
  func: async ({ jwt, db }, { email, password }, { setSession }) => {
    const user = await db.verifyCredentials(email, password)
    await setSession({ userId: user.id })
    return { token: jwt.sign({ userId: user.id }) }
  },
})

export const logout = pikkuFunc({
  func: async ({}, _data, { clearSession }) => {
    await clearSession()
  },
})
```
