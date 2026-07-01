# @pikku/better-auth

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
