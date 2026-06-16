---
"@pikku/inspector": patch
"@pikku/cli": patch
"@pikku/better-auth": patch
"@pikku/addon-console": patch
"@pikku/console": patch
"@pikku/core": patch
---

feat: emit auth provider + plugin metadata as `auth-meta.gen.json` for the console SSO page

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
