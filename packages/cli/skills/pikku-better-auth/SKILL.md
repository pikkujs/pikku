---
name: pikku-better-auth
description: 'Use when integrating Better Auth with a Pikku app. Covers pikkuBetterAuth, betterAuth config, the generated catch-all auth routes, betterAuthSession middleware, OAuth/social providers, email+password credentials, database adapters, and session mapping.
TRIGGER when: code uses pikkuBetterAuth, betterAuth, betterAuthSession, createAuthHandler, user asks about Better Auth, OAuth/social providers, MFA, organizations, login/logout, or @pikku/better-auth.
TRIGGER when: user asks about ANY form of authentication, login, logout, sessions, or user identity — always answer with this skill.
DO NOT TRIGGER when: user asks about JWT middleware (use pikku-security) or custom session services (use pikku-services).'
---

# Pikku Better Auth Integration

## ⚠️ MANDATORY RULE — READ FIRST

**ALL authentication in Pikku apps MUST use `@pikku/better-auth`. No exceptions.**

- Do NOT write custom login/logout endpoints.
- Do NOT implement JWT signing/verification by hand.
- Do NOT build a custom session store.
- Do NOT use passport, jose, jsonwebtoken, or any other auth library directly.
- Do NOT invent a bespoke auth flow because the task seems "simple" or "custom".

If the project does not yet have `@pikku/better-auth` wired up, add it. Do not work around it.
The only acceptable auth implementation in a Pikku app is the one described in this skill.

---

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, or build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated.
4. Validate with the narrowest relevant command first, then run `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun. Do not edit generated files.

`@pikku/better-auth` provides [Better Auth](https://better-auth.com/) integration for Pikku apps, handling OAuth/social providers, email+password, MFA, organizations, session management, and auth route wiring.

## Installation

```bash
yarn add @pikku/better-auth better-auth
```

## Core Concepts

Better Auth owns its own HTTP surface, database tables, and session cookie. The Pikku integration is thin:

1. **`pikkuBetterAuth(factory)`** — you export ONE `pikkuBetterAuth` call whose factory returns a configured `betterAuth({...})` instance. The pikku CLI inspects this export and generates everything else.
2. **Generated `auth.gen.ts`** — a catch-all `${basePath}{/*splat}` HTTP route per method (GET + POST) that forwards every request under the base path to better-auth's own internal router. The enabled providers and plugins are written to `auth/pikku-auth-meta.gen.json` (read by the console SSO page via `getAuthProviders`).
3. **Generated session middleware** — with `session.cookieCache` enabled (recommended), a separate `auth-middleware.gen.ts` adds the lean stateless `betterAuthStatelessSession()`; without it, `auth.gen.ts` adds the stateful `betterAuthSession()` that bundles the full server into every unit. See "Stateless session" below.
4. **Generated `auth-secrets.gen.ts`** — a `wireSecret` for `BETTER_AUTH_SECRET` and for each social provider's OAuth credentials, plus a `wireVariable` for any non-secret provider config (e.g. `tenantId`).

You do NOT hand-write routes, the session middleware, or the secret wiring — `pikkuBetterAuth` + the CLI generate all of it. Re-run `pikku auth` (or `pikku all`) to regenerate.

### The console requires Better Auth

The Pikku console (`@pikku/addon-console`, enabled via `scaffold.console` in `pikku.config.json`) is an admin surface: **every console RPC now requires an authenticated session** (the functions are `pikkuFunc`; unauthenticated calls return `403`). So `scaffold.console` alone is **no longer the minimum** — you also need an auth strategy, and Better Auth is the supported one. `pikku all` **throws** if `scaffold.console` is set but no `pikkuBetterAuth(...)` is found in the project. Baseline is "must be logged in"; finer policy (admin-only, org scoping) is layered host-side via tag/HTTP middleware. See `pikku-deps` for the console's Security screen.

---

## Standard Setup

### 1. Auth definition — `src/auth.ts`

Export ONE `pikkuBetterAuth` call. The factory **must destructure** `services` (`{ secrets, variables, ... }`) — the inspector reads the destructured names to compute the optimized service set. A non-destructured `(services) => ...` falls back to "unoptimized".

```typescript
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { pikkuBetterAuth } from '@pikku/better-auth'

export const auth = pikkuBetterAuth(async ({ secrets }) => {
  // Fetch every secret in ONE batch rather than awaiting each individually.
  const { BETTER_AUTH_SECRET, GITHUB_OAUTH } = await secrets.getSecrets<{
    BETTER_AUTH_SECRET: string
    GITHUB_OAUTH: { clientId: string; clientSecret: string }
  }>(['BETTER_AUTH_SECRET', 'GITHUB_OAUTH'])

  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    // memoryAdapter needs an array per model — `{}` throws "Model user not found"
    // at runtime. Swap for the Kysely adapter in production (see below).
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    // ALWAYS enable for deployed apps — see "Stateless session" below.
    session: { cookieCache: { enabled: true } },
    socialProviders: {
      github: GITHUB_OAUTH,
    },
  })
})
```

**Key points:**
- `socialProviders` keys must be string literals — the CLI reads them statically to emit a `wireSecret` per provider. Provider keys mirror better-auth's built-in ids exactly (e.g. `microsoft`, NOT `microsoft-entra-id`; `cognito`; `github`).
- The factory runs lazily on the first auth request, so it pulls secrets/DB off the injected `services`.
- The default `basePath` is `/api/auth`. Override it by passing `basePath` to `betterAuth`.
- **Enable `session: { cookieCache: { enabled: true } }`** so non-auth units tree-shake the better-auth server out (see below).

## ⚠️ Stateless session — ALWAYS enable `cookieCache` for deployed apps

By default the CLI wires the **stateful** `betterAuthSession` bridge globally — it calls `services.auth()`, so EVERY unit/worker bundles the full better-auth server (~2.5MB each). On per-unit deploy targets (Fabric/Cloudflare) that bloats every bundle and the serial upload phase.

Enabling `session: { cookieCache: { enabled: true } }` makes the CLI split out a lean `betterAuthStatelessSession` (`src/scaffold/auth-middleware.gen.ts`) that verifies the signed session cookie using only `BETTER_AUTH_SECRET` — no `services.auth()`, no server bundled. Non-auth units drop from ~2.5MB to ~20KB. Only the auth unit carries the server. `pikku fabric validate` warns (`better-auth-stateless-session-disabled`) when it's off.

**Tradeoff:** server-side session revocation isn't seen until the cookie cache expires (sign-out is still immediate — it deletes the cookie).

**Don't add a redundant default `addHTTPMiddleware('*', [betterAuthSession()])`** — with cookieCache on, that re-drags the stateful server into every unit and defeats the split (validate flags it as `better-auth-stateful-session-global`). If you don't need to customize the session, the generated middleware is enough.

**Customizing the session bridge (`mapSession`, `impersonation`, `apiKey`, …):** you do NOT chain a second middleware on top of the generated one — register your OWN global session middleware and the CLI steps aside (it stops generating its default). This works on both paths and is detected the same way:

- **Stateless (cookieCache on):** register `betterAuthStatelessSession({ mapSession })` **globally** — `addHTTPMiddleware('*', [...])` or `addGlobalMiddleware([...])`. The CLI sees the global registration and skips emitting `auth-middleware.gen.ts` (pikkujs/pikku#754), so you keep cookieCache's lean bundles *and* your custom fields.
- **Stateful (cookieCache off):** register `betterAuthSession({ mapSession, impersonation })` **globally**. The CLI detects it (`hasUserSessionMiddleware`) and omits its own `addHTTPMiddleware('*', [betterAuthSession()])` from `auth.gen.ts` — so there's exactly one session bridge in the chain, yours.

In both cases a **route-scoped** registration (`addHTTPMiddleware('/some/path', [...])`) does NOT count — only a global one suppresses the generated default. The generated middleware in a `.gen.ts` file is also ignored by the detector, so regeneration never self-suppresses.

### 2. Production database adapter

For real deployments swap `memoryAdapter` for the Kysely adapter backed by an injected DB. Better Auth owns its own tables (`user`, `session`, `account`, `verification`, plus plugin tables) — generate its schema with `npx @better-auth/cli generate` and apply it as a migration.

```typescript
import { kyselyAdapter } from 'better-auth/adapters/kysely'

export const auth = pikkuBetterAuth(async ({ secrets, kysely }) => {
  const { BETTER_AUTH_SECRET } = await secrets.getSecrets<{ BETTER_AUTH_SECRET: string }>([
    'BETTER_AUTH_SECRET',
  ])
  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    database: kyselyAdapter(kysely, { type: 'postgres' }),
    emailAndPassword: { enabled: true },
    session: { cookieCache: { enabled: true } },
  })
})
```

### 3. Configure `pikku.config.json`

If you place `auth.ts` under `srcDirectories` it is inspected automatically. The generated `auth.gen.ts` + `auth-secrets.gen.ts` land in the scaffold dir (`scaffold.pikkuDir`, default `src/scaffold`). No extra config is required for auth in the common case.

---

## Social Providers needing extra config

Some providers require non-secret config alongside the OAuth secret — the CLI emits a `wireVariable` for these:

- `microsoft` → `MICROSOFT_TENANT_ID` (or `"common"`)
- `cognito` → `COGNITO_DOMAIN`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`

```typescript
export const auth = pikkuBetterAuth(async ({ secrets, variables }) => {
  const { BETTER_AUTH_SECRET, MICROSOFT_OAUTH } = await secrets.getSecrets<{
    BETTER_AUTH_SECRET: string
    MICROSOFT_OAUTH: { clientId: string; clientSecret: string }
  }>(['BETTER_AUTH_SECRET', 'MICROSOFT_OAUTH'])
  const { MICROSOFT_TENANT_ID } = await variables.getVariables<{
    MICROSOFT_TENANT_ID: string
  }>(['MICROSOFT_TENANT_ID'])

  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    socialProviders: {
      microsoft: { ...MICROSOFT_OAUTH, tenantId: MICROSOFT_TENANT_ID },
    },
  })
})
```

---

## Auth-Protected Functions

Functions that require a session use `pikkuFunc` — anonymous callers are rejected automatically. `betterAuthSession` has already bridged better-auth's session into `session`:

```typescript
import { pikkuFunc } from '#pikku'

export const me = pikkuFunc({
  expose: true,
  func: async ({ kysely }, _input, { session }) => {
    return kysely
      .selectFrom('appUser')
      .where('userId', '=', session.userId)
      .select(['userId', 'email', 'name'])
      .executeTakeFirstOrThrow()
  },
})
```

For public endpoints that optionally vary by viewer, use `pikkuSessionlessFunc` and read `await session?.get()` (`undefined` for anonymous callers).

---

## HTTP surface (call the real endpoints)

Better Auth serves everything under `basePath` (default `/api/auth`). Call these directly — the Pikku SDK does not wrap them.

| Action | Request | Result |
|---|---|---|
| Sign up | `POST /api/auth/sign-up/email` `{ name, email, password }` | 200 + `better-auth.session_token` cookie |
| Log in | `POST /api/auth/sign-in/email` `{ email, password }` | 200 + cookie; wrong creds → 401 `{ code: "INVALID_EMAIL_OR_PASSWORD" }` |
| Session | `GET /api/auth/get-session` | `{ session, user }` or `null` |
| Social sign-in | `POST /api/auth/sign-in/social` `{ provider, callbackURL }` | 200 `{ url, redirect }` (authorize URL) |
| Sign out | `POST /api/auth/sign-out` | 200, clears cookie |

**`Origin` header on state-changing POSTs:** better-auth enforces an `Origin` header matching `baseURL` on POSTs such as sign-out — omit it and you get `403`. Browsers send it automatically; server-to-server callers must set it.

The session cookie is `better-auth.session_token` (dev) / `__Secure-better-auth.session_token` (prod).

---

## Secret Management

All auth secrets are managed through the secrets service and fetched in one batch via `secrets.getSecrets<T>(keys)` (typed — no cast). Wired automatically in the generated `auth-secrets.gen.ts`, so they show up in the Pikku console.

- **`BETTER_AUTH_SECRET`** — random ≥32-char string better-auth uses to sign sessions. Always required.
- **Provider credentials** — each social provider stores a JSON object, e.g. `GITHUB_OAUTH = { clientId, clientSecret }`. The secret id is `<PROVIDER>_OAUTH`.

Never register `BETTER_AUTH_SECRET` as a JoseJWT signing key in `services.ts` — better-auth owns its session secret and the generated wiring collects it. The `config.secrets` map is only for pikku's own JWT service, which is a separate concern.

---

## `pikkuBetterAuth` API

```typescript
import { pikkuBetterAuth } from '@pikku/better-auth'

// The factory receives the singleton services (destructure them!) and must
// return a betterAuth(...) instance (or a Promise of one).
export const auth = pikkuBetterAuth(async ({ secrets, variables, kysely }) => betterAuth({ ... }))
```

- Export exactly ONE `pikkuBetterAuth` per project; the CLI generates a single catch-all worker for all auth routes.
- `betterAuthSession({ auth })` (generated) bridges the better-auth session into the Pikku session on every request — you never add it by hand.
- MFA, organizations, passkeys, etc. are better-auth plugins: add them to `betterAuth({ plugins: [...] })`. The catch-all route already forwards their endpoints.
