---
"@pikku/core": patch
"@pikku/inspector": patch
"@pikku/cli": patch
"@pikku/better-auth": patch
"@pikku/addon-console": patch
---

feat(auth): migrate auth integration from Auth.js to Better Auth

The auth integration is now built on [Better Auth](https://better-auth.com)
and ships as a single package, `@pikku/better-auth` (replacing the former
`@pikku/auth-js`). There is exactly one auth package now.

- `defineAuth(async ({ secrets, variables }) => betterAuth({ ... }))` is the new
  single entry point. The CLI inspects the `betterAuth(...)` call and generates:
  - `auth.gen.ts` — a catch-all `${basePath}{/*splat}` HTTP route per method and
    a global `betterAuthSession({ auth })` middleware that bridges the Better
    Auth session into the Pikku wire session.
  - `auth-secrets.gen.ts` — `wireSecret(BETTER_AUTH_SECRET)` plus a
    `<PROVIDER>_OAUTH` secret for each configured social provider, and
    `wireVariable` for non-secret provider config (e.g. `MICROSOFT_TENANT_ID`,
    `COGNITO_DOMAIN`/`REGION`/`USER_POOL_ID`).
  - `auth.types.ts` — a typed `defineAuth` re-export.
- `add-auth` (inspector) walks into the `betterAuth(...)` options to discover the
  configured providers and required secrets/variables.
- The auth secret is now auto-wired by codegen from `BETTER_AUTH_SECRET` — it no
  longer needs to be registered as a JWT signing key in `services.ts`.

CLI fix included: scaffold files generated outside `srcDirectories` (e.g. an
`auth.gen.ts` under a project's `pikku/` dir) are now added to the inspector's
wiring files, so their routes and secret metadata are picked up. The generated
wiring imports Pikku types via a resolved relative path instead of a hardcoded
`#pikku` specifier, so templates without a `#pikku` import map type-check.
