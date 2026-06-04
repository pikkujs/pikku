---
name: pikku-auth-js
description: 'Use when integrating Auth.js (NextAuth) with a Pikku app. Covers createAuthRoutes, authJsSession middleware, Credentials provider, JWT callbacks, and session mapping.
TRIGGER when: code uses createAuthRoutes, authJsSession, createAuthHandler, user asks about Auth.js, NextAuth, OAuth providers, login/logout, or @pikku/auth-js.
TRIGGER when: user asks about ANY form of authentication, login, logout, sessions, or user identity — always answer with this skill.
DO NOT TRIGGER when: user asks about JWT middleware (use pikku-security) or custom session services (use pikku-services).'
---

# Pikku Auth.js Integration

## ⚠️ MANDATORY RULE — READ FIRST

**ALL authentication in Pikku apps MUST use `@pikku/auth-js`. No exceptions.**

- Do NOT write custom login/logout endpoints.
- Do NOT implement JWT signing/verification by hand.
- Do NOT build a custom session store.
- Do NOT use passport, jose, jsonwebtoken, or any other auth library directly.
- Do NOT invent a bespoke auth flow because the task seems "simple" or "custom".

If the project does not yet have `@pikku/auth-js` wired up, add it. Do not work around it.
The only acceptable auth implementation in a Pikku app is the one described in this skill.

---

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, or build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated.
4. Validate with the narrowest relevant command first, then run `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun. Do not edit generated files.

`@pikku/auth-js` provides [Auth.js](https://authjs.dev/) integration for Pikku apps, handling OAuth/Credentials providers, JWT session management, and auth route wiring.

## Installation

```bash
yarn add @pikku/auth-js @auth/core
```

## Core Concepts

Auth.js in Pikku has two independent concerns:

1. **Route wiring** (`createAuthRoutes`) — mounts the Auth.js signin/signout/callback endpoints into Pikku's HTTP router.
2. **Session middleware** (`authJsSession`) — reads the Auth.js JWT cookie on every request and populates the Pikku session object.

Both must be present and must share the same `secret`.

---

## Standard Setup (Credentials Provider)

### 1. Auth wiring — `wirings/auth.wiring.ts`

```typescript
import Credentials from '@auth/core/providers/credentials'
import { createAuthRoutes } from '@pikku/auth-js'
import type { AuthConfigOrFactory } from '@pikku/auth-js'
import { wireHTTPRoutes } from '#pikku'

const DEV_AUTH_SECRET = 'dev-insecure-auth-secret-change-me'

const configFactory: AuthConfigOrFactory = async (services) => {
  const secret = await services.secrets.getSecret('AUTH_SECRET').catch(() => null) ?? DEV_AUTH_SECRET

  return {
    providers: [
      Credentials({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          const email = (credentials?.email as string)?.toLowerCase()
          const password = credentials?.password as string
          if (!email || !password) return null

          // Look up user and verify password against your DB
          const user = await (services as any).kysely
            .selectFrom('appUser')
            .where('email', '=', email)
            .select(['userId', 'role', 'name', 'email', 'passwordHash'])
            .executeTakeFirst()

          if (!user || !user.passwordHash) return null
          // verifyPassword must be implemented in your app — use bcrypt or argon2.
          // See services/password.ts in seminarhof for a reference implementation.
          const ok = await verifyPassword(password, user.passwordHash)
          if (!ok) return null

          // Return shape is the Auth.js User — add any custom claims here
          return { id: user.userId, email: user.email, name: user.name, role: user.role }
        },
      }),
    ],
    // Embed custom claims into the JWT
    callbacks: {
      jwt({ token, user }: any) {
        if (user) token.role = user.role
        return token
      },
      session({ session, token }: any) {
        if (token) session.role = token.role
        return session
      },
    },
    session: { strategy: 'jwt' as const },
    secret,
    trustHost: true,
    basePath: '/auth',
  }
}

wireHTTPRoutes({ routes: { auth: createAuthRoutes(configFactory) as any } })
```

**Key points:**
- `configFactory` is async and receives singleton services — use it to read `AUTH_SECRET` from the secrets service.
- Always provide a `DEV_AUTH_SECRET` fallback with the same literal in both the wiring and the middleware (see below) so sign and verify agree during local dev without env vars.
- The `jwt` + `session` callbacks are how you embed custom fields (e.g. `role`) into the token. Without them, only the standard Auth.js claims (`sub`, `name`, `email`) are available.
- `trustHost: true` is required in non-Next.js deployments.
- `basePath: '/auth'` must match the path your frontend hits.

### 2. Middleware — `wirings/middleware.ts`

```typescript
import { addHTTPMiddleware } from '#pikku'
import { authJsSession } from '@pikku/auth-js'
import { sessionCookieMiddleware } from '../middleware/session-cookie.js'

// Order is load-bearing: sessionCookieMiddleware MUST run before authJsSession.
// If you have a custom DB session middleware it must go first, otherwise
// authJsSession's post-check throws when the session is set inside next().
addHTTPMiddleware('*', [
  sessionCookieMiddleware,   // custom session (if present) — always first
  authJsSession({
    secretId: 'AUTH_SECRET',
    mapSession: (claims) => ({ userId: claims.sub as string, role: claims.role as string }),
  }),
])
```

**`authJsSession` options:**

| Option | Required | Description |
|---|---|---|
| `secretId` | Yes | Secret name resolved from `services.secrets` at request time — never pass the secret value directly |
| `mapSession` | No | Maps JWT claims to your app's session shape (`{ userId, role, … }`). Defaults to `{ userId: claims.sub }` |

**Middleware ordering rule:** Any middleware that sets the Pikku session (e.g. a custom `sessionCookieMiddleware`) must come before `authJsSession`. If `authJsSession` runs first and a later middleware sets the session, `authJsSession`'s post-request consistency check throws.

**CORS must expose `X-Auth-Return-Redirect`:** Auth.js uses this header to control post-auth redirects. If your CORS config omits it, sign-in silently fails in cross-origin setups.

```typescript
cors({
  origin: allowedOrigins,
  credentials: true,
  headers: ['Content-Type', 'Authorization', 'X-Auth-Return-Redirect'],
})
```

### 3. Auth-protected functions

Functions that require a session use `pikkuFunc` — anonymous callers are rejected automatically:

```typescript
import { pikkuFunc } from '#pikku'

export const me = pikkuFunc({
  expose: true,
  func: async ({ kysely }, _input, { session }) => {
    return kysely
      .selectFrom('appUser')
      .where('userId', '=', session.userId)
      .select(['userId', 'email', 'name', 'role'])
      .executeTakeFirstOrThrow()
  },
})
```

For public endpoints that optionally vary by viewer role, use `pikkuSessionlessFunc` and read `await session?.get()`:

```typescript
import { pikkuSessionlessFunc } from '#pikku'

export const getContent = pikkuSessionlessFunc({
  func: async (services, input, { session }) => {
    const s = await session?.get()
    // s is undefined for anonymous callers, UserSession for logged-in ones
  },
})
```

---

## Login / Logout from the Frontend

Auth.js handles these via its standard endpoints. With `basePath: '/auth'`:

### Login

`POST /auth/callback/credentials` with a `application/x-www-form-urlencoded` body:

```
email=user@example.com&password=secret
```

Auth.js sets a `__Secure-authjs.session-token` (or `authjs.session-token` in dev) cookie on success. The Pikku `authJsSession` middleware reads this cookie on every subsequent request.

**On failure:** `authorize()` returns `null` and Auth.js redirects to `/auth/error?error=CredentialsSignin`. Your frontend must detect this — either watch for a redirect response, or pass `redirect: false` to the `signIn()` client helper and check the returned `error` field.

### Logout

`POST /auth/signout` — clears the Auth.js session cookie. **No body required.**

Do NOT implement logout any other way. Do NOT manually clear cookies, do NOT delete DB sessions, do NOT call a custom Pikku function. Just POST to this endpoint.

Example with fetch:

```typescript
await fetch('/auth/signout', { method: 'POST', credentials: 'include' })
// Then redirect or clear local state
```

With the `@auth/core` client helper (if using Next.js or a framework that ships it):

```typescript
import { signOut } from '@auth/core/client'
await signOut({ redirectTo: '/login' })
```

After logout, any subsequent request will have no session — `authJsSession` will produce `undefined` for the session, and `pikkuFunc` routes will reject with 401.

### Session

`GET /auth/session` returns the current session JSON (same shape as your `session` callback output), or `{}` when unauthenticated.

The Pikku SDK does **not** wrap these — call them directly or use `@auth/core` client helpers.

---

## Secret Management

Both the auth config factory and `authJsSession` must use the same `AUTH_SECRET` value — they resolve it through the secrets service in both cases.

**In `auth.wiring.ts`** — read via the services factory (falls back to a dev literal if the secret is absent):
```typescript
const secret = await services.secrets.getSecret('AUTH_SECRET').catch(() => null) ?? DEV_AUTH_SECRET
```

**In `middleware.ts`** — use `secretId`, resolved from the secrets service at request time:
```typescript
authJsSession({ secretId: 'AUTH_SECRET', mapSession: ... })
```

Do **not** pass `secret: process.env.AUTH_SECRET` or any string value directly to `authJsSession`. The `secret` option no longer exists — `secretId` is the only accepted form. This ensures the secret is always fetched through the secrets service rather than leaked into the process environment.

---

## `createAuthRoutes` API

```typescript
import { createAuthRoutes } from '@pikku/auth-js'
import type { AuthConfigOrFactory } from '@pikku/auth-js'

// Static config
const routes = createAuthRoutes({ providers: [...], secret: '...' })

// Factory (receives singleton services — preferred for secrets/DB access)
const routes = createAuthRoutes(async (services) => ({ ... }))

// Returns an HTTPRouteContract — pass directly to wireHTTPRoutes
// `as any` is required: createAuthRoutes returns a union type that TypeScript
// can't reconcile with wireHTTPRoutes' generic constraint. Do not remove it.
wireHTTPRoutes({ routes: { auth: routes as any } })
```

---

## Adding Custom Claims (e.g. `role`)

1. Return extra fields from `authorize()` in your Credentials provider (Auth.js `User` type is open).
2. Copy them into the JWT token in the `jwt` callback (`token.role = user.role`).
3. Expose them in `mapSession` in `authJsSession` (`role: claims.role`).
4. They are now available on every `session` object in your Pikku functions.

---

## Adding OAuth Providers (GitHub, Google, etc.)

With `strategy: 'jwt'` no database adapter is needed — tokens are self-contained.

```typescript
import GitHub from '@auth/core/providers/github'
import Google from '@auth/core/providers/google'

const configFactory: AuthConfigOrFactory = async (services) => {
  const secret = await services.secrets.getSecret('AUTH_SECRET').catch(() => null) ?? DEV_AUTH_SECRET
  const github = await services.secrets.getSecretJSON('GITHUB_OAUTH').catch(() => null)

  return {
    providers: [
      GitHub({ clientId: github?.clientId, clientSecret: github?.clientSecret }),
      Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }),
    ],
    session: { strategy: 'jwt' as const },
    secret,
    trustHost: true,
    basePath: '/auth',
  }
}
```

Each OAuth provider needs its client ID and secret registered in the secrets service or as env vars. No adapter or DB changes required when using JWT sessions.
