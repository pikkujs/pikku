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
    setSession({ userId: user.id, role: user.role })
    return { token: jwt.sign({ userId: user.id }) }
  },
})

// Clear session (logout)
const logout = pikkuFunc({
  func: async ({}, _data, { clearSession }) => {
    clearSession()
  },
})
```

## Built-in Auth Strategies

Apply these via `addHTTPMiddleware` in a wirings file:

```typescript
import { authBearer, authCookie, authAPIKey } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '@pikku/core/http'

// JWT bearer token — reads Authorization header
addHTTPMiddleware('*', [authBearer()])

// Cookie-based sessions — auto-refreshes JWT
addHTTPMiddleware('*', [
  authCookie({
    name: 'session',
    expiresIn: { value: 30, unit: 'day' },
    options: { httpOnly: true, secure: true },
  }),
])

// API key — from x-api-key header or ?apiKey= query param
addHTTPMiddleware('*', [authAPIKey({ source: 'all' })])
```

## Complete Example

```typescript
// permissions.ts
import { pikkuAuth, pikkuPermission } from '#pikku'

export const isAuthenticated = pikkuAuth(
  async (_services, session) => !!session
)
export const isAdmin = pikkuAuth(
  async (_services, session) => session?.role === 'admin'
)

// wirings/auth.wiring.ts
import { authCookie } from '@pikku/core/middleware'
import { addHTTPMiddleware } from '@pikku/core/http'

addHTTPMiddleware('*', [
  authCookie({ name: 'session', expiresIn: { value: 30, unit: 'day' } }),
])

// functions/auth.functions.ts
export const login = pikkuFunc({
  auth: false,
  func: async ({ jwt, db }, { email, password }, { setSession }) => {
    const user = await db.verifyCredentials(email, password)
    setSession({ userId: user.id, role: user.role })
    return { token: jwt.sign({ userId: user.id }) }
  },
})

export const logout = pikkuFunc({
  func: async ({}, _data, { clearSession }) => {
    clearSession()
  },
})
```
