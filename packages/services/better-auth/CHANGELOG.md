# @pikku/better-auth

## 0.12.25

### Patch Changes

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- a7fcd2e: Declare dependencies that were imported but missing from `package.json`

  `@pikku/openapi-parser` and `@pikku/better-auth` imported `zod`, `@pikku/next`
  imported `path-to-regexp`, `@pikku/cli` imported `kysely`, and
  `@pikku/assistant-ui` imported `rxjs`, none of which were declared. Each
  resolved through Yarn hoisting inside the monorepo and would fail for anyone
  installing the package on its own.

  `rxjs`, `kysely` and `path-to-regexp` reach consumers through public
  signatures — `Observable<BaseEvent>` is the return type of a published method,
  and `createCoercionPlugin` returns a `KyselyPlugin` — so they are runtime
  dependencies rather than build-only ones.

  `@pikku/assistant-ui` pins `rxjs` to the exact `7.8.1` that `@ag-ui/client`
  pins, rather than a caret range. The two packages exchange `Observable`s, so a
  range that floats to a second copy gives them two incompatible `Observable`
  types.

  `@pikku/kysely` also drops `SqliteSerializePlugin`, an alias of
  `SerializePlugin` that has been marked `@deprecated` in favour of it. Use
  `SerializePlugin`.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84

## 0.12.24

### Patch Changes

- 3a4d50a: Five `console:scope*` descriptions and two `pikku *-prune` warnings promised a
  grant or revoke "takes effect on their next request — no re-login". That is
  only true when `withResolvedScopes` actually resolves, and it skips resolution
  whenever `mapSession`/`mapKey` has already set `scopes` — which is
  authoritative and deliberately never overridden.

  So an app whose `mapSession` derives scopes from something like
  `result.user.role` — the shape the `wire-scope` scaffold teaches — can grant a
  scope from the console, see it stored, and have it never reach a session. The
  revoke direction is worse: `roles prune` and `scopes prune` reported that users
  lose the scopes on their next request when in fact they keep them.

  Copy only; no behaviour change. The docblock on `withResolvedScopes` now states
  that the propagation guarantee is conditional on resolution running at all, so
  the next person copying that sentence into UI copy carries the caveat with it.

## 0.12.23

### Patch Changes

- 8ad051c: feat(better-auth): store-backed sessions with a header or cookie transport

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

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82

## 0.12.22

### Patch Changes

- cba98fb: Security hardening sweep
  - **Content uploads require a signature**, matching reads. `handleUpload` previously validated the path and the size limit and then wrote the file, so an unauthenticated `PUT` to the upload prefix landed on disk. The express server, which verified nothing at all, now verifies both uploads and reads.
  - **The remote-RPC prefix is matched case-insensitively.** The router matches routes case-insensitively, so `/Remote/RPC/fn` reached the same handler while a case-sensitive `startsWith('/remote/rpc/')` let it past the mesh trust gate and the token's `fn` binding.
  - **Dev quick-login refuses proxied requests.** The gate checked the hostname only, so a request forwarded with `Host: localhost` was auto-provisioned a root-admin session. Proxy markers (`forwarded`, `x-forwarded-*`) now refuse regardless of what they claim, and dev login is inert in production.
  - **Logout clears the session cookie** instead of re-signing an absent session into a fresh, unexpired one.
  - **Short-flag cluster parsing is bounded**, closing a CLI-over-channel denial of service.
  - `allowedHosts` is carried into secret definition meta.

- Updated dependencies [41c1a95]
- Updated dependencies [ce96383]
- Updated dependencies [7e60867]
- Updated dependencies [f8f1244]
- Updated dependencies [dcf20cb]
- Updated dependencies [6512384]
- Updated dependencies [e3b4c14]
- Updated dependencies [efd0ed1]
- Updated dependencies [cba98fb]
- Updated dependencies [ce96383]
- Updated dependencies [f8f1244]
- Updated dependencies [f8f1244]
- Updated dependencies [6e93a35]
- Updated dependencies [6dada45]
  - @pikku/core@0.12.80

## 0.12.21

### Patch Changes

- 78b29f0: `SecretService` now returns a `SecretValue<T>` rather than the bare value, so a
  vault secret cannot reach a sink by accident.

  `SecretValue` is nominally typed, which means it is not assignable to `string`
  (or to any other concretely-typed field). Every sink with a real type — a
  database column, an email body, a session payload — rejects it with no lint
  rule involved. The sinks typed `any`, `unknown`, or a free generic — the logger,
  queue payloads, webhook and email inputs, and a function's own output — are
  guarded with `Safe<T>`, which collapses a `SecretValue` found anywhere inside
  `T`, however deeply nested, to `never`.

  Unwrap deliberately at the point the secret reaches the wire:

  ```ts
  const secret = await secrets.getSecret('BETTER_AUTH_SECRET')
  betterAuth({ secret: secret.reveal() })
  ```

  Two behaviours cover what types cannot see. Structured serialization redacts —
  `JSON.stringify` and node's inspect both yield `[secret]`, so an audit or log
  write stays honest without crashing the request. String coercion throws
  `SecretCoercionError`, because a template literal is always a leak.

  `AuditLog.write` is guarded the same way as the logger, since an audit event
  carries `input` and `metadata` as `unknown` and nominality alone cannot stop a
  secret landing in one.

  `.reveal()` is the deliberate escape hatch, and what it hands back is an
  ordinary string as far as every sink signature is concerned. **PKU953** closes
  that gap: under `pikku all --security` the inspector reports a revealed secret
  that flows into a logger, an audit, a queue, an email or a webhook — `console` included.

  This also fixed a real one: `remote-addon-auth.ts` called `String(token)` on an
  `unknown` and wrote the result straight into an `Authorization` header.

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.12.76

## 0.12.20

### Patch Changes

- 45859cf: Keep a cross-site-embedded app signed in on browsers that refuse third-party cookies.

  `AUTH_COOKIE_CROSS_SITE` already rewrote every better-auth cookie to
  `SameSite=None; Secure; Partitioned` so a session survives inside a third-party iframe
  (the Fabric sandbox preview). That is a Chromium answer: `Partitioned` (CHIPS) is not
  implemented in WebKit, which blocks third-party cookie writes outright — and every
  browser on iOS is WebKit. On a phone, sign-in returned 200, the browser dropped the
  cookie, the next request arrived anonymous and the app bounced back to `/login`.

  The same flag now also enables a cookie relay, over storage the embedded frame is
  actually allowed to use. The auth handler echoes the cookies it just set in
  `x-pikku-cross-site-set-cookie` (JS can never read `Set-Cookie` itself); the client
  sends them back in `x-pikku-cross-site-cookie`, and every place this package hands
  caller headers to better-auth — `createAuthHandler`, `betterAuthSession`,
  `betterAuthStatelessSession`, `getAuthSession` and `callAdminApi` — merges that header
  into `Cookie` before reading the session. A real cookie always wins over a relayed one
  of the same name, so a browser that did store it stays authoritative.

  Sign-out becomes partly the client's job: deleting a cookie cannot reach the client's
  own storage, so a client implementing the relay must drop the entries the sign-out
  response expires. Under `betterAuthStatelessSession` a kept-around cache blob otherwise
  keeps verifying until it ages out.

  Both header names, `crossSiteCookies()`, `decodeSetCookies()` and
  `mergeRelayedCookies()` are exported for clients that implement the browser half — the
  echo header carries a percent-encoded JSON array, so the client needs the decoder to
  read it at all. A response carrying the echo header is marked
  `Cache-Control: no-store`: caches along the path know to be careful with `Set-Cookie`
  and nothing about this one, and a stored copy would hand one user's session to the next.

  Unchanged for everyone else: the relay is honoured only when `AUTH_COOKIE_CROSS_SITE`
  is set, which only a runtime that embeds its apps cross-site sets. A deployed app keeps
  `SameSite=Lax` cookies and ignores the header entirely.

- a7b26c5: rename the inspected declarations to `define*`: `wireScope` → `defineScope`, `wireSecret` → `defineSecret`, `wireVariable` → `defineVariable`, `wireCredential` → `defineCredential`

  `wire*` meant two unrelated things. A transport wiring attaches a function to
  something that can invoke it — `wireHTTP`, `wireChannel`, `wireScheduler`,
  `wireQueueWorker` and the rest — and the thing it wires runs. These four wire
  nothing: they are no-ops that exist only so the call typechecks, they are
  tree-shaken out of the build, and their whole job is to be found by the
  inspector's AST pass and turned into a type union. One word for both left the
  declaration reading like a registration with a runtime.

  So the vocabulary splits: **`wire*` is a transport, `define*` is an inspected
  declaration.**

  ```ts
  import { defineScope } from '@pikku/core/scope'
  import { defineSecret } from '@pikku/core/secret'
  import { defineVariable } from '@pikku/core/variable'
  import { defineCredential } from '@pikku/core/credential'

  defineScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })
  ```

  **Breaking:** no alias is kept. Rename the four call sites; the module subpaths
  (`@pikku/core/scope`, `/secret`, `/variable`) are unchanged.

  The inspector matches these by identifier text, so a stale `wire*` call is not a
  type error — it is silently not extracted, and the generated union comes back
  empty. That fails as "this scope isn't declared" on code that was fine a moment
  ago, nowhere near the declaration. Grep for the old names rather than trusting a
  clean build.

  An addon published with `.pikku` output generated before this release re-exports
  `wireSecret` from `@pikku/core/secret` and will not typecheck against this core
  until it is rebuilt and republished.

- Updated dependencies [c984df6]
- Updated dependencies [63ff32b]
- Updated dependencies [ba6cc08]
- Updated dependencies [d007191]
- Updated dependencies [a7b26c5]
- Updated dependencies [457cb25]
- Updated dependencies [f7567ad]
- Updated dependencies [ba6cc08]
- Updated dependencies [a2e21e5]
- Updated dependencies [457cb25]
- Updated dependencies [86a50b9]
- Updated dependencies [0e0f6eb]
  - @pikku/core@0.12.73

## 0.12.19

### Patch Changes

- ae4f59a: Gate admin capabilities on scopes, and scaffold user management

  Admin capabilities were gated on `user.role === 'admin'` — a single text column
  meaning "can do everything". Impersonating a user, rebinding a shared
  credential and reading the user directory are distinct capabilities that one
  user can hold independently, so they are now scopes on an `admin` tree:

  | Gate                                   | Scope                    |
  | -------------------------------------- | ------------------------ |
  | impersonation                          | `admin:impersonate`      |
  | `credentialOAuth`'s `canLinkSingleton` | `admin:credentials:link` |
  | reading the user directory             | `admin:users:list`       |
  | creating a user out of band            | `admin:users:create`     |
  | ban / unban                            | `admin:users:ban`        |
  | delete a user                          | `admin:users:remove`     |
  | revoke a user's sessions               | `admin:users:sessions`   |
  | set a user's password                  | `admin:users:password`   |

  Holding the bare `admin` scope satisfies all of them via pikku's existing
  parent-grant rule, so it is a one-for-one replacement for the old role.

  better-auth's `admin()` plugin is still what implements ban, delete,
  session-revocation and set-password, so it stays. Its `user.role` column is no
  longer something pikku grants: it is _projected_ from the scope store when a
  session is built, and only from the scopes whose capability better-auth's own
  endpoints gate on the caller's role. Someone granted `admin:users:list` can read
  the directory — which goes straight to the auth adapter — without gaining the
  power to ban, and revoking a scope demotes the role on the next sign-in. Scopes
  remain the single source of truth.

  New `scaffold.userAdmin` in `pikku.config.json` generates the whole set —
  `pikkuAdminListUsers`, `pikkuAdminCreateUser`, `pikkuAdminSetUserBanned`,
  `pikkuAdminRemoveUser`, `pikkuAdminRevokeUserSessions` and
  `pikkuAdminSetUserPassword` — into your project. Listing or banning a user is
  ordinary application behaviour and must not require installing the console.
  Codegen fails with an actionable error if better-auth is wired without
  `admin()`. The console's Users page calls these same functions, showing each
  action only where the caller holds its scope.

  Every scaffold now emits a directory named for its domain — `scaffold/admin/`,
  `scaffold/rpc/`, `scaffold/agent/`, `scaffold/auth/`, `scaffold/console/`,
  `scaffold/graph/`, `scaffold/realtime/`, `scaffold/scenarios/`,
  `scaffold/webhook/`, `scaffold/workflow/` — holding its wiring file beside a
  `*.schemas.gen.ts` sibling, and every generated payload is a zod schema instead
  of a TypeScript generic. The schemas have to stand alone: the inspector reads a
  zod schema by importing the module that declares it, which it cannot do for a
  wiring file whose relative pikku-types import per-unit deploy codegen rewrites.

  Resolving a schema by reference rather than by name also fixes the agent HTTP
  surface. `agentCaller` and `agentStreamCaller` take the same payload but had to
  repeat the type literal verbatim in each generic position, because the extractor
  synthesised the schema name from the _function_ name and so recorded an
  `inputSchemaName` with no schema behind it whenever the two shared a named
  alias — every agent call through that alias failed with `MissingSchemaError`.
  One `AgentCall` schema now backs both.

  Where a payload's shape belongs to `@pikku/core` (`WorkflowRunStatus`,
  `FunctionCoverageReport`, `StubCall[]`) the generated function carries no
  `output` schema and the inspector infers it from the handler's return type;
  re-declaring a core type in zod would be a second definition free to drift.

  Upgrading rewrites the layout in place: codegen prunes the pre-directory copy of
  each scaffold file before it inspects the source tree, since the old flat file
  still wires the same routes and leaving it behind would wire everything twice.

  `@pikku/core` gains `hasScopes(required, held)`, the non-throwing counterpart to
  `verifyScopes`, and declares `auth` on `CoreSingletonServices` — the auth
  instance the generated `pikkuServices` wrapper already injected but never typed.
  A scope root declared twice (an addon and its host both contributing the same
  `admin` tree) now flattens to one entry per id instead of emitting it twice.

  BREAKING: there is no role fallback for the scope-gated capabilities. An app
  that relied on the old default must register a `ScopeService` and grant `admin`
  (or a narrower `admin:*` scope). Every gate fails closed and warns when no
  `ScopeService` is registered. `delegatedAuth`'s `defaultRole`/`mapRole` now
  grant a pikku role through the `ScopeService` instead of writing better-auth's
  `role` column, and the `credentialOAuth` platform user no longer sets `banned`.

  BREAKING: the console reads its user directory over the scaffolded
  `pikkuAdminListUsers` RPC (gated on `admin:users:list`, backed by better-auth's
  `$context.adapter`) instead of `client.admin.listUsers`, and
  `UsersTableUser`/`UsersTableLabels` no longer carry `role` — there is no role
  column to render. `@pikku/addon-console` no longer ships a `console:listUsers`
  function: user management is not the console's job, so a host that wants the
  Users page must enable `scaffold.userAdmin`.

- Updated dependencies [ae4f59a]
  - @pikku/core@0.12.67

## 0.12.18

### Patch Changes

- 416606c: `betterAuthStatelessSession` now catches a throwing `secrets.getSecret()` (e.g. during Next.js static export), logs a warning, and skips gracefully instead of crashing.
- 739c9f8: `betterAuthSession` now checks the live session, not the wire's stale snapshot, before re-resolving.

  The middleware skipped when a session was already present, but it read the wire's
  static `session` field — a snapshot taken at wire construction that a prior
  middleware's `setSession` never updates (that writes the session service). So when an
  app registered its own `betterAuthSession` first (e.g. to enrich the session with a
  role via `mapSession`, or to resolve impersonation) and the generated
  `betterAuthSession()` ran after it, the guard saw no session and re-resolved with the
  default map — clobbering the enriched session with a bare `{ userId }`. The guard now
  reads `getSession()`, so the second middleware correctly steps aside and the first
  middleware's session survives.

- c2a66dc: `credentialOAuthProviders` now skips an OAuth2 credential whose app secret is
  UNCONFIGURED (the secret does not exist yet) instead of throwing. Previously a
  single unconfigured provider — e.g. an installed addon's OAuth2 credential the
  operator has not set up (now that addon credential meta is merged into the
  consuming app's `CREDENTIAL_OAUTH2_CONFIGS`) — threw `Requested secret not
found` while building the auth instance, which took down the ENTIRE better-auth
  instance: every `getSession` and sign-up 500'd. Missing app secrets are logged
  at `warn` (pass the singleton `logger` as the optional third argument) and the
  provider is left out; a secret that IS present but malformed (no `clientId`)
  still throws as a genuine misconfiguration.
- 13474a6: feat: resolve session scopes from a registered ScopeService

  `betterAuthSession` and `betterAuthStatelessSession` now fill `session.scopes`
  from the registered `ScopeService` on every path — human, machine (API key), and
  impersonation. Because the session middleware already runs per request, a grant
  change takes effect on the next request with no re-login and nothing to
  invalidate.

  A `scopes` set by `mapSession`/`mapKey` is authoritative and is never widened,
  so an API key can be minted with narrower rights than the user who owns it.
  Resolution is inert when no `ScopeService` is registered.

- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [13474a6]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [9f0d0eb]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [7b2ea23]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64

## 0.12.17

### Patch Changes

- ac4c3f4: Add the `delegatedAuth()` plugin: `POST /sign-in/delegated` verifies a user's existing credentials against an imported upstream API (via an `authenticate` callback), JIT-provisions a real user keyed by a `providerId: 'delegated'` account row, persists the upstream token per-user (`storeCredential`, before the session is minted), and refreshes name/role on every sign-in. Passwords are never stored.
- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.16

### Patch Changes

- bacd398: Add the `fabric()` auth plugin: `POST /sign-in/fabric` mints an app-admin session
  for a synthetic, `fabric: true` operator row (created with `role: 'admin'`) after
  verifying a short-lived RS256 token signed by the Fabric control plane (checked
  against a configured RSA public key, `fabric({ publicKey })`) — letting a Fabric
  operator administer a client app without being one of its real users, and without
  any per-environment shared secret. Verification uses WebCrypto so it runs in
  Cloudflare Workers. Mirrors `actor()`; use alongside `admin()`.

## 0.12.15

### Patch Changes

- bbbb196: Dev quick login for the console when running locally (#857). The better-auth
  catch-all handler now serves `<basePath>/dev/quick-login` when
  `PIKKU_DEV_QUICK_LOGIN` is set AND the request host is a loopback address:
  GET reports availability, POST idempotently seeds an `admin@pikku.dev` admin
  user and returns a signed-in session. `pikku serve` / `pikku dev` enable the
  flag by default (set `PIKKU_DEV_QUICK_LOGIN=false` to opt out), and the
  console login screen shows a one-click "Quick login as admin@pikku.dev"
  button whenever a local server advertises the endpoint.
- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.
- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52

## 0.12.14

### Patch Changes

- 5f2c566: Better Auth actor plugin for user flows: `actor({ secret })` adds an `actor`
  boolean column on `user` and a `POST /sign-in/actor` endpoint (`{ email,
secret }`, constant-time compare). Actor rows are auto-created on first
  sign-in; a real (non-actor) user can never be impersonated with the secret.
  The flag propagates into the pikku core session (`CoreUserSession.actor`) via
  both `betterAuthSession` and `betterAuthStatelessSession`, so audits and
  analytics can address synthetic traffic.
- Updated dependencies [5f2c566]
- Updated dependencies [8dfddc3]
  - @pikku/core@0.12.48

## 0.12.13

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.12

### Patch Changes

- a3f55de: Add an optional `impersonation` config to `betterAuthSession` (and the stateless variant). When configured, a request carrying the impersonation header (default `x-pikku-impersonate-user-id`) and passing the `canImpersonate` gate resolves the session as the target user via `loadUser`; unknown targets fall back to the real caller with a warning, self-impersonation is a no-op, and the header is inert when impersonation is not configured. Lets an admin act as another user without a bespoke middleware.

## 0.12.11

### Patch Changes

- 7d959ed: fix(better-auth): stop swallowing `mapSession` assertion errors

  `betterAuthSession` and `betterAuthStatelessSession` wrapped the session **read**
  and the caller's **`mapSession`** call in one `try/catch` that downgraded any
  throw to a `logger.warn` and continued with no session. So a `mapSession` that
  deliberately throws — e.g. asserting a required `role` claim is present — was
  silently caught, leaving the request unauthenticated and producing a baffling
  403 on every gated route (the symptom: the user's role shows correctly in a
  direct `/get-session` read, yet authorized RPCs all 403).

  The read now lives in its own `try` (a genuine `getSession`/cookie failure is
  logged at `error` and re-thrown rather than masked), and `mapSession` runs
  outside it so its errors propagate. No more silent "no session".

## 0.12.10

### Patch Changes

- 7c0b318: feat(better-auth): rewrite auth cookies for cross-site (iframe) use when
  `AUTH_COOKIE_CROSS_SITE` is set.

  When an app runs embedded in a cross-site iframe (e.g. a preview where the
  top-level page and the app are different sites), a `SameSite=Lax` session cookie
  is silently dropped by the browser — sign-in "succeeds" but the next request
  arrives with no cookie, so the session never sticks.

  `createAuthHandler` now rewrites every `Set-Cookie` on the auth response to
  `SameSite=None; Secure; Partitioned` when `process.env.AUTH_COOKIE_CROSS_SITE`
  is `true`/`1`. This is the single point every better-auth cookie flows through
  (sign-in/up/out, OAuth callbacks, refresh — the session middlewares only read
  cookies), so no per-app config is needed. Only the embedding runtime sets the
  flag; deployed apps never do and keep the tighter `SameSite=Lax` default.

- Updated dependencies [f6adc1c]
  - @pikku/core@0.12.36

## 0.12.9

### Patch Changes

- ef50347: Tree-shake the better-auth server out of non-auth units.
  - `@pikku/better-auth`: add `betterAuthStatelessSession()` — a session middleware that verifies the signed better-auth cookie cache via `better-auth/cookies` (`getCookieCache`) using only `BETTER_AUTH_SECRET`, with no `services.auth()`, DB round-trip, or full server import. Mark the package `sideEffects: false` so unused barrel re-exports drop.
  - `@pikku/cli`: when `session.cookieCache` is enabled in the better-auth config, generate the stateless session middleware into a separate `auth-middleware.gen.ts` and wire it globally, keeping the full `/api/auth/**` server only in the auth unit. Deploy artifacts (esbuild metafile + sourcemap) are now off by default; `--debug-artifacts` re-enables them.
  - `@pikku/inspector`: ensure the orphan `auth-middleware.gen.ts` (imported by nothing) is still inspected so its global `addHTTPMiddleware('*')` registration is not dropped.

  Net effect: a non-auth unit carries ~22KB (cookie-verify floor) instead of the full ~1.25MB better-auth backend.

## 0.12.8

### Patch Changes

- c899301: Move Better Auth framework adapters into `@pikku/next` and the new `@pikku/tanstack-start` runtime package, while keeping generic auth-factory resolution in `@pikku/better-auth`.

## 0.12.7

### Patch Changes

- 2eaa9fd: feat(cli,better-auth): unified machine + human auth (pikku login + api-key)

  A single better-auth-backed model for authenticating CLIs and machines.
  - **Human**: `pikku login` / `logout` / `whoami` run a device-authorization flow
    and persist a session at `~/.pikku/session.json` (0600, keyed by base URL, with
    expiry).
  - **Machine**: `betterAuthSession()` gains a stateless api-key branch — it resolves
    scope via `verifyApiKey` (not `getSession`, which drops metadata) and is
    authoritative when the `x-api-key` header is present.
  - **Auto-wire**: generated channel CLI clients attach the credential on the WS
    upgrade handshake (`PIKKU_API_KEY` → `x-api-key`, else the stored token →
    `Bearer`), so `betterAuthSession` resolves before the channel opens.

  `@better-auth/api-key` is a separate official package (not in the better-auth
  plugins barrel); peer-requires `better-auth ^1.6.19`.

- Updated dependencies [2eaa9fd]
  - @pikku/core@0.12.34

## 0.12.6

### Patch Changes

- a027a8e: feat: emit auth provider + plugin metadata as `auth-meta.gen.json` for the console SSO page

  The enabled social providers and Better Auth plugins are now extracted statically
  and written to a generated `auth-meta.gen.json`, replacing the runtime
  `setAuthRegistry`/`getAuthRegistry` approach — so the console can show them without
  evaluating the Better Auth factory.
  - **inspector**: the `pikkuBetterAuth` inspector now reads the `plugins` array from
    the `betterAuth({ ... })` config and records each plugin id (the callee name of
    each `plugins: [organization(), bearer()]` entry) on the auth definition.
  - **cli**: `pikku auth` (and `pikku all`) emit `auth/pikku-auth-meta.gen.json` (path
    configurable via `authMetaJsonFile`) containing `basePath`, `hasCredentials`, the
    enabled `providers` (`id` + `displayName` + `secretId`), and the enabled `plugins`
    (`id` + `displayName`). The previous `setAuthRegistry(...)` runtime wiring is
    removed from the generated `auth.gen.ts`.
  - **better-auth**: exports a `PLUGIN_REGISTRY` and `pluginDisplayName(id)` helper so
    plugin ids resolve to human-readable names.
  - **core**: removes the unreleased `setAuthRegistry`/`getAuthRegistry` runtime auth
    registry (now superseded by `auth-meta.gen.json`).
  - **addon-console**: `getAuthProviders` reads `auth-meta.gen.json` and returns the
    configured providers, plugins, and `hasCredentials` flag.
  - **console**: the Auth Providers (SSO) page fetches `console:getAuthProviders` and
    marks each provider configured/unconfigured, lists email+password credentials as a
    provider, and shows the enabled Better Auth plugins.

- a027a8e: feat(auth): migrate auth integration from Auth.js to Better Auth

  The auth integration is now built on [Better Auth](https://better-auth.com)
  and ships as a single package, `@pikku/better-auth` (replacing the former
  `@pikku/auth-js`). There is exactly one auth package now.
  - `pikkuBetterAuth(async ({ secrets, variables }) => betterAuth({ ... }))` is the new
    single entry point. The CLI inspects the `betterAuth(...)` call and generates:
    - `auth.gen.ts` — a catch-all `${basePath}{/*splat}` HTTP route per method and
      a global `betterAuthSession({ auth })` middleware that bridges the Better
      Auth session into the Pikku wire session.
    - `auth-secrets.gen.ts` — `wireSecret(BETTER_AUTH_SECRET)` plus a
      `<PROVIDER>_OAUTH` secret for each configured social provider, and
      `wireVariable` for non-secret provider config (e.g. `MICROSOFT_TENANT_ID`,
      `COGNITO_DOMAIN`/`REGION`/`USER_POOL_ID`).
    - `auth.types.ts` — a typed `pikkuBetterAuth` re-export.
  - `add-auth` (inspector) walks into the `betterAuth(...)` options to discover the
    configured providers and required secrets/variables.
  - The auth secret is now auto-wired by codegen from `BETTER_AUTH_SECRET` — it no
    longer needs to be registered as a JWT signing key in `services.ts`.

  CLI fix included: scaffold files generated outside `srcDirectories` (e.g. an
  `auth.gen.ts` under a project's `pikku/` dir) are now added to the inspector's
  wiring files, so their routes and secret metadata are picked up. The generated
  wiring imports Pikku types via a resolved relative path instead of a hardcoded
  `#pikku` specifier, so templates without a `#pikku` import map type-check.

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/core@0.12.32
