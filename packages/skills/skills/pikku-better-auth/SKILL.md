---
name: pikku-better-auth
description: >-
  Use when integrating Better Auth with a Pikku app. Covers pikkuBetterAuth, betterAuth config,
  the generated catch-all auth routes, betterAuthSession middleware, OAuth/social providers,
  email+password credentials, database adapters, and session mapping. TRIGGER when: code uses
  pikkuBetterAuth, betterAuth, betterAuthSession, createAuthHandler, user asks about Better Auth,
  OAuth/social providers, MFA, organizations, login/logout, or @pikku/better-auth. TRIGGER when: user asks
  about the actor plugin, /sign-in/actor, signing in as a scenario persona, or SCENARIO_ACTOR_SECRET. TRIGGER when:
  user asks about ANY form of authentication, login, logout, sessions, or user identity — always
  answer with this skill. DO NOT TRIGGER when: user asks about JWT middleware (use pikku-security)
  or custom session services (use pikku-services).
installGroups: [fabric]
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
4. **Generated `auth-secrets.gen.ts`** — a `defineSecret` for `BETTER_AUTH_SECRET` and for each social provider's OAuth credentials, plus a `defineVariable` for any non-secret provider config (e.g. `tenantId`).

You do NOT hand-write routes, the session middleware, or the secret wiring — `pikkuBetterAuth` + the CLI generate all of it. Re-run `pikku all` to regenerate.

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
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
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

- `socialProviders` keys must be string literals — the CLI reads them statically to emit a `defineSecret` per provider. Provider keys mirror better-auth's built-in ids exactly (e.g. `microsoft`, NOT `microsoft-entra-id`; `cognito`; `github`).
- The factory runs lazily on the first auth request, so it pulls secrets/DB off the injected `services`.
- The default `basePath` is `/api/auth`. Override it by passing `basePath` to `betterAuth`.
- **Enable `session: { cookieCache: { enabled: true } }`** so non-auth units tree-shake the better-auth server out (see below).

## ⚠️ Stateless session — ALWAYS enable `cookieCache` for deployed apps

By default the CLI wires the **stateful** `betterAuthSession` bridge globally — it calls `services.auth()`, so EVERY unit/worker bundles the full better-auth server (~2.5MB each). On per-unit deploy targets (Fabric/Cloudflare) that bloats every bundle and the serial upload phase.

Enabling `session: { cookieCache: { enabled: true } }` makes the CLI split out a lean `betterAuthStatelessSession` (`src/scaffold/auth-middleware.gen.ts`) that verifies the signed session cookie using only `BETTER_AUTH_SECRET` — no `services.auth()`, no server bundled. Non-auth units drop from ~2.5MB to ~20KB. Only the auth unit carries the server. `pikku fabric validate` warns (`better-auth-stateless-session-disabled`) when it's off.

**Tradeoff:** server-side session revocation isn't seen until the cookie cache expires (sign-out is still immediate — it deletes the cookie).

**Don't add a redundant default `addHTTPMiddleware('*', [betterAuthSession()])`** — with cookieCache on, that re-drags the stateful server into every unit and defeats the split (validate flags it as `better-auth-stateful-session-global`). If you don't need to customize the session, the generated middleware is enough.

**Customizing the session bridge (`mapSession`, `impersonation`, `apiKey`, …):** you do NOT chain a second middleware on top of the generated one — register your OWN global session middleware and the CLI steps aside (it stops generating its default). This works on both paths and is detected the same way:

- **Stateless (cookieCache on):** register `betterAuthStatelessSession({ mapSession })` **globally** — `addHTTPMiddleware('*', [...])` or `addGlobalMiddleware([...])`. The CLI sees the global registration and skips emitting `auth-middleware.gen.ts` (pikkujs/pikku#754), so you keep cookieCache's lean bundles _and_ your custom fields.
- **Stateful (cookieCache off):** register `betterAuthSession({ mapSession, impersonation })` **globally**. The CLI detects it (`hasUserSessionMiddleware`) and omits its own `addHTTPMiddleware('*', [betterAuthSession()])` from `auth.gen.ts` — so there's exactly one session bridge in the chain, yours.

In both cases a **route-scoped** registration (`addHTTPMiddleware('/some/path', [...])`) does NOT count — only a global one suppresses the generated default. The generated middleware in a `.gen.ts` file is also ignored by the detector, so regeneration never self-suppresses.

### Admin capabilities are scopes, not a role

Scopes are the source of truth for what an admin may do; nothing in pikku reads
a `role`. A role is not a permission: "who may impersonate" and "who may rebind a
shared credential" are different capabilities one user can hold independently,
which a single `role` string cannot express. Every gate the package owns
resolves the caller's scopes through the registered `ScopeService` and checks the
`admin:*` tree (`ADMIN_SCOPES` exports the ids so you never spell them as bare
strings):

| Gate                                                                 | Scope required             |
| -------------------------------------------------------------------- | -------------------------- |
| `impersonation` (`betterAuthSession` / `betterAuthStatelessSession`) | `admin:impersonate`        |
| `credentialOAuth`'s `canLinkSingleton`                               | `admin:credentials:link`   |
| the console's user directory                                         | `admin:users:list`         |
| create a user out of band                                            | `admin:users:create`       |
| ban / unban                                                          | `admin:users:ban`          |
| delete a user and their data                                         | `admin:users:remove`       |
| revoke a user's sessions                                             | `admin:users:sessions`     |
| set a user's password                                                | `admin:users:password`     |
| read credential values and who holds them                            | `admin:credentials:read`   |
| set and delete credentials                                           | `admin:credentials:manage` |
| view declared scopes, roles, and who holds them                      | `admin:scopes:read`        |
| create roles, change their scopes, grant them                        | `admin:scopes:manage`      |
| read the audit trail                                                 | `admin:audit:read`         |

Holding the bare `admin` scope satisfies all of them — a parent grant covers
everything nested beneath it — so `admin` is the direct replacement for the old
`role === 'admin'`.

Declare the tree in your own `defineScope` (the CLI extracts it by AST, so it must
be an inline literal; `ADMIN_SCOPE_TREE` is exported from `@pikku/better-auth`
as the reference shape). Apps wiring `@pikku/addon-console` inherit it already.

```typescript
defineScope({
  admin: {
    displayName: 'Administration',
    description: 'Capabilities that act on the application as a whole',
    scopes: {
      impersonate: { description: 'Act as another user' },
      credentials: {
        description: 'Application-wide credentials',
        scopes: {
          link: { description: 'Bind a shared credential for every user' },
          read: { description: 'Read credential values and who holds them' },
          manage: { description: 'Set and delete credentials' },
        },
      },
      users: {
        description: 'The user directory',
        scopes: {
          list: { description: 'List and search users' },
          create: { description: 'Create users out of band' },
          ban: { description: 'Ban and unban users' },
          remove: { description: 'Delete users and all their data' },
          sessions: { description: "Revoke a user's sessions" },
          password: { description: "Set a user's password" },
        },
      },
      scopes: {
        description: 'Authorization management',
        scopes: {
          read: {
            description: 'View declared scopes, roles, and who holds them',
          },
          manage: {
            description:
              'Create and delete roles, change their scopes, and grant roles to users',
          },
        },
      },
      audit: {
        description: 'The audit trail',
        scopes: {
          read: {
            description:
              'Read the audit trail — every recorded action, and which user took it',
          },
        },
      },
    },
  },
})
```

Then grant it — via a role (`scopeService.createRole({ name: 'admin', scopes: ['admin'] })` plus `addUserToRole`) or directly with `addScopeToUser`.

Every gate **fails closed**: with no `ScopeService` registered nothing can hold
a scope, so nothing is authorized, and the denial is logged at `warn` because
that is a configuration bug rather than a permissions decision. Pass your own
`canImpersonate` / `canLinkSingleton` to override the default entirely.

### Do not wire better-auth's `admin()` plugin

Every capability in the table is pikku's own, gated by the scope next to it and
implemented against better-auth's internal adapter — `createAuthUser`,
`setAuthUserPassword`, `setAuthUserBanned`, `deleteAuthUser` and
`revokeAuthUserSessions`, all exported from `@pikku/better-auth`.

`admin()` would add a second gate on a `user.role` column that pikku otherwise
ignores, which means maintaining two grant systems that have to agree — and the
column loses, since the scope store is what the rest of the framework reads.
Pikku used to project scopes onto it for exactly that reason; dropping the
plugin dropped the projection with it.

Banning is the one capability with a schema requirement, and it has its own
small plugin:

```typescript
import { pikkuBan } from '@pikku/better-auth'

betterAuth({ plugins: [pikkuBan()] })
```

`pikkuBan()` adds `banned`, `banReason` and `banExpires` to `user` and refuses to
create a session for a banned user, lapsing an expired ban as it goes. It makes
no authorization decision — who may ban is decided by `admin:users:ban` — so it
never needs to know about scopes or roles.

### The plugins `@pikku/better-auth` ships

Five, all imported from the package root and passed to `betterAuth({ plugins })`
like any other. None is automatic — an app wires the ones it needs.

| Plugin                   | Plugin `id`        | Adds                                                                    | Use it when                                                   |
| ------------------------ | ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `pikkuBan()`             | `pikku-ban`        | `user.banned/banReason/banExpires`                                      | You ban users (the schema + enforcement half of the above)    |
| `pikkuActor()`           | `actor`            | `POST /sign-in/actor`, `user.actor`                                     | Scenarios or a dev switcher sign in as a persona              |
| `pikkuCredentialOAuth()` | `credential-oauth` | `POST /credential-oauth/link`, `/credential-oauth/callback/:providerId` | An app links OAuth2 **API credentials** for a user            |
| `pikkuDelegatedAuth()`   | `delegated-auth`   | `POST /sign-in/delegated`                                               | An imported upstream API is the system of record for identity |
| `pikkuFabric()`          | `fabric`           | `POST /sign-in/fabric`                                                  | A Fabric-deployed app lets a control-plane operator in        |

Every one carries a `pikku` prefix, because a `plugins: [...]` array mixes these
with better-auth's own and a bare `actor()` next to `organization()` says
nothing about where it came from. The unprefixed names — `ban`, `actor`,
`credentialOAuth`, `delegatedAuth`, `fabric` — are still exported as deprecated
aliases, so existing apps keep working.

The plugin's `id` is what better-auth stores; the **export name** is what the
inspector reads off your `plugins` array and what generated metadata is keyed
by, so the two differ for every one of them.

#### `pikkuCredentialOAuth()` — link API credentials, not identities

```typescript
pikkuCredentialOAuth({
  config: [
    {
      providerId: 'github',
      type: 'wire',
      clientId,
      clientSecret,
      authorizationUrl,
      tokenUrl,
      scopes: ['repo'],
    },
    { providerId: 'slack', type: 'singleton' /* … */ },
  ],
  scopeService,
  logger,
})
```

Wraps better-auth's `genericOAuth` to keep its token exchange and refresh, and
replaces only the two identity-bound endpoints. `genericOAuth`'s own
`/oauth2/link` models an identity **provider**: it demands a userinfo response
and refuses to link when the provider's email differs from the user's. A
credential is not an identity — most credential providers expose only
`/authorize` and `/token` — so the account row is keyed on _whose_ credential it
is (`accountId` = the linking user's id), making `(providerId, userId)` unique
by construction. Tokens land in better-auth's `account` table, so
`auth.api.getAccessToken()` refreshes them on read.

`type` decides the blast radius:

- **`wire`** — every user links their own, and the credential is read on
  the wire that runs as them. Signed in is enough.
- **`singleton`** — one token the whole app shares, owned by a reserved
  `pikku-platform` user row created on demand. Rebinding it changes the
  credential for _everyone_, so it is gated on `admin:credentials:link` (or the
  `admin` root above it), and **fails closed** with no `ScopeService`. Override
  the whole gate with `canLinkSingleton`.

An undeclared `providerId` is a 404; an anonymous caller a 401; a refused
singleton a 403 that leaves no platform user behind.

#### `pikkuDelegatedAuth()` — the upstream API is the identity provider

```typescript
pikkuDelegatedAuth({
  authenticate: async ({ email, password, apiKey }) => upstream.login(...),
  storeCredential: (userId, identity) =>
    credentialService.set('acme', identity.credential, userId),
  defaultRole: 'member',
  mapRole: (upstreamRole) => ROLE_MAP[upstreamRole],
  scopeService,
  logger,
})
```

`POST /sign-in/delegated` forwards the credentials the user already has to
`authenticate`. On success it JIT-provisions a real user row (email-keyed and
`emailVerified` — the upstream just verified them), links it via an `account`
row (`providerId: 'delegated'`, `accountId: externalId`), persists the upstream
token **before** minting the session, and returns a normal session cookie.
Passwords are never stored. Exactly one upstream per app: additional imported
APIs are linked integrations (`credentialOAuth`), not extra login methods.

A resolved role is granted through the `ScopeService` as a pikku role, so it
lands in `pikku_user_role` rather than on a column. A role the app never
defined is a provisioning gap, not a sign-in failure — the grant is dropped with
a warning and the user still gets in.

`storeCredential` failing, by contrast, **fails the sign-in**: every proxied
call would be dead anyway.

#### `pikkuFabric()` — control-plane operator sign-in

```typescript
pikkuFabric({ publicKey: FABRIC_AUTH_PUBLIC_KEY, scopeService, logger })
```

`POST /sign-in/fabric` verifies a short-lived RS256 token that the Fabric
control plane signed for an operator session, then signs them into a synthetic
`fabric-<id>@fabric.internal` row holding the `admin` scope. Asymmetric on
purpose: the app holds only the public key, so it can never forge an operator
login, and the same `FABRIC_AUTH_PUBLIC_KEY` is distributed to every stage with
no per-environment secret. A missing or empty key disables the endpoint, and a
token whose `purpose` claim is not `fabric-admin` is rejected. Without a
`ScopeService` the operator signs in holding nothing.

### 2. Production database adapter

For real deployments swap `memoryAdapter` for the Kysely adapter backed by an injected DB. Better Auth owns its own tables (`user`, `session`, `account`, `verification`, plus plugin tables) — generate its schema with `npx @better-auth/cli generate` and apply it as a migration.

```typescript
import { kyselyAdapter } from 'better-auth/adapters/kysely'

export const auth = pikkuBetterAuth(async ({ secrets, kysely }) => {
  const { BETTER_AUTH_SECRET } = await secrets.getSecrets<{
    BETTER_AUTH_SECRET: string
  }>(['BETTER_AUTH_SECRET'])
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

Some providers require non-secret config alongside the OAuth secret — the CLI emits a `defineVariable` for these:

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
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
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
import { pikkuFunc } from '#pikku/function'

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

| Action         | Request                                                     | Result                                                                  |
| -------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Sign up        | `POST /api/auth/sign-up/email` `{ name, email, password }`  | 200 + `better-auth.session_token` cookie                                |
| Log in         | `POST /api/auth/sign-in/email` `{ email, password }`        | 200 + cookie; wrong creds → 401 `{ code: "INVALID_EMAIL_OR_PASSWORD" }` |
| Session        | `GET /api/auth/get-session`                                 | `{ session, user }` or `null`                                           |
| Social sign-in | `POST /api/auth/sign-in/social` `{ provider, callbackURL }` | 200 `{ url, redirect }` (authorize URL)                                 |
| Sign out       | `POST /api/auth/sign-out`                                   | 200, clears cookie                                                      |

**`Origin` header on state-changing POSTs:** better-auth enforces an `Origin` header matching `baseURL` on POSTs such as sign-out — omit it and you get `403`. Browsers send it automatically; server-to-server callers must set it.

The session cookie is `better-auth.session_token` (dev) / `__Secure-better-auth.session_token` (prod).

### Dev quick login

Set `PIKKU_DEV_QUICK_LOGIN=true` and `${basePath}/dev/quick-login` signs in a
fixed dev admin (`admin@pikku.dev`), creating the user idempotently and granting
it the bare `admin` scope. It is guarded twice — the env var _and_ a localhost
hostname check — because a one-request path to an admin session is exactly the
thing that must not survive a deploy. An app that has not declared the `admin`
scope still gets a session, with a warning, since a scopeless dev user is useful.

### Actor sign-in (`actor` plugin)

A different thing from dev quick login, and the one to reach for when "sign in as
someone" means **a particular kind of user** rather than one fixed admin.
Register it explicitly — it is not automatic:

```typescript
import { pikkuActor } from '@pikku/better-auth'

plugins: [pikkuActor({ secret: SCENARIO_ACTOR_SECRET })]
```

`POST ${basePath}/sign-in/actor` `{ email, secret, name? }` → 200 + the normal
session cookie. The plugin's `secret` is the **root**, and it may be a (possibly
async) function so it can come off the secrets service instead of a captured
value.

**What a caller presents is not the root.** It is
`deriveActorSecret(root, email)` from `@pikku/core/services` — HKDF-expanded
HMAC-SHA256 over the lowercased address. The endpoint re-derives the expected
value for the address being signed in as and compares, so a credential minted
for one persona is refused for every other, and the root itself is never a valid
credential. A root under 32 characters refuses the endpoint outright rather than
deriving weak credentials from it (the server log names the problem; the client
is not told which). Callers rarely derive by hand — `pikku dev` mints one per
persona into `VITE_DEV_ACTOR_SECRETS` for the browser switcher, `pikku persona
secret <id>` mints them for a run, and the two `PersonaSignIn` implementations
derive on the fly.

**Which command is running decides whether it works, not whether a secret is
set.** `pikku dev` sets `PIKKU_DEV_ACTOR_SIGN_IN` and mints an ephemeral
`SCENARIO_ACTOR_SECRET` for the run, so local development needs no configuration
at all. Everywhere else the endpoint refuses (`Actor sign-in is disabled outside
\`pikku dev\``) — `pikku serve` clears the marker outright, so a secret that
leaked into a production environment enables nothing and gets a warning naming
itself instead.

A stage that genuinely must run scenarios opts in on purpose, with
`PIKKU_ALLOW_ACTOR_SIGN_IN=passwordless-actor-sign-in`. Any other value is
ignored and warned about, so the hatch cannot be opened by copying a `true` from
the line above, and it is the only hatch — there is no build-time option, because
an option compiled into the bundle cannot be audited from the environment it
runs in.

**Signing in and provisioning are separate powers.** An unknown address becomes
an `actor: true` row only under `pikku dev`. With the opt-in set, a stage signs
in as the personas the deployment provisioned when it started and refuses
everything else (`No actor account exists for that address`), so holding the
secret on such a stage does not let anyone invent identities. Those rows are
written by the fabric plugin when an operator asks to act as an address the
stage has no account for, so provisioning needs no actor secret and works on a
stage whose endpoint is shut.

**`SCENARIO_ACTOR_SECRET` is a credential as powerful as the most privileged
persona.** Provisioning grants declared roles to actor accounts, so an
`admin` persona is an actor holding real admin — anyone with the secret _and_ the
opt-in can take a session as one. Do not treat "actors only" as a licence to open
the hatch in production.

Within that boundary, three properties bound the damage:

- **It only ever signs in actors.** The plugin adds a `user.actor` boolean
  column; an email matching a row without it is refused with `User is not an
actor`. So the secret cannot take over a **real user's** account — the blast
  radius is the actor accounts and whatever roles they were granted.
- **Unknown emails are created only under `pikku dev`**, flagged `actor: true`,
  so a local scenario declaring a new persona needs no seed step. Anywhere else
  the account has to have been provisioned at boot first.
- **A credential is bound to one address**, so a leaked one is one synthetic
  account rather than the whole actor population; only the root is worth the
  paragraph above. The comparison is constant-time and length-hiding, so a wrong
  credential leaks neither the length nor a prefix of the right one.

This is the endpoint `pikku scenario` signs its actors in through, and the one
the frontend dev switcher posts to — see `pikku-scenario` for declaring the
actors and `pikku-react` for `useDevActors()`.

### Provisioning personas

Anywhere but `pikku dev`, the accounts have to exist before anyone signs in. The
stage creates them itself, from the personas you hand `pikkuFabric`:

```ts
import { pikkuFabric } from '@pikku/better-auth'
import {
  personaConfigs,
  personaEnvironments,
} from '#pikku/pikku-personas.gen.js'

pikkuFabric({
  publicKey,
  audience,
  scopeService,
  personas: {
    personas: personaConfigs,
    environments: personaEnvironments,
  },
})
```

There is nothing else to call and nothing to schedule. The plugin's operator
endpoint resolves the address the caller wants to act as; a miss provisions the
declaration and looks again. On a stage that already holds the persona that is
one query, and the pass only runs when there is genuinely something absent to
create.

**Do not reach for `pikkuServerLifecycle`'s `afterStart` for this.** That hook is
invoked by `pikku serve` and `pikku dev` and by nothing else — no deploy runtime
calls it — so a stage on Workers or a serverless target that provisioned from
`afterStart` provisioned nothing, and every persona signed in holding no roles.

An app that boots its own server through `pikku serve` is the one case where
that hook does run, and it can call `provisionPersonas` from `@pikku/better-auth`
directly:

```ts
import { provisionPersonas } from '@pikku/better-auth'

await provisionPersonas(
  { auth, scopeService, logger },
  { personas: personaConfigs, environments: personaEnvironments }
)
```

Provisioning runs where the database already is, which is the point: the CLI has
no connection to a deployed environment's database — it resolves one from the
local project config — so a `pikku persona sync staging` that wrote rows would
write them to whatever database the checkout happened to point at. `pikku persona
sync <environment>` still exists, and reports who that environment will provision
and why anyone was skipped, which is what you run _before_ the deploy.

It creates missing accounts as `actor: true`, applies the roles each persona
declares, and is additive — it never revokes. `PIKKU_ENV` (or an explicit
`environment`) selects who is eligible, through the same rule that decides who
may run there; an address already held by a real, non-actor user throws rather
than being granted the persona's roles.

**Deleting a persona does not delete its account.** Being additive leaves a hole:
the account keeps every role it was granted, and the actor endpoint authenticates
on the `actor` column alone without consulting the declaration — so an `admin`
persona nobody declares any more is still a live way in wherever that endpoint is
open. By default provisioning warns about those accounts and changes nothing.
`orphans: 'ban'` shuts them:

```ts
pikkuFabric({
  publicKey,
  audience,
  scopeService,
  personas: {
    personas: personaConfigs,
    environments: personaEnvironments,
    orphans: 'ban',
  },
})
```

It writes the same `banned` column the console's ban RPC writes (so it needs the
`pikkuBan()` plugin wired, and says so if it isn't), revokes the account's sessions,
and leaves the row, its grants and its history intact — provisioning lifts the
ban again by itself if the persona comes back. Deleting is deliberately not
offered: an actor row is referenced by whatever those scenarios did while it
existed.

`report` is the default because a rolling deploy runs the new replica's
provisioning while the old replica is still serving, so for the length of that
overlap "no persona claims this" is a statement about the newer declaration only.
A persona pinned to another environment counts as unclaimed here — it has no
business holding a signable account in an environment its own rule refuses it.

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
