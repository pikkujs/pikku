---
"@pikku/cli": patch
"@pikku/cucumber": patch
---

fix: typed secret/variables access in Better Auth factories + cucumber Actor cookie jar

- **cli**: the generated `#pikku` `pikkuBetterAuth` wrapper now substitutes the
  project's generated `TypedSecretService` / `TypedVariablesService` for the base
  `secrets` / `variables` services (typed and wrapped at runtime, the same way
  addon services are). The auth factory can read provider secrets straight off
  the generated `CredentialsMap` — `socialProviders: { github: await
  secrets.getSecret('GITHUB_OAUTH') }` — with no inline `getSecrets<{ ... }>()`
  generic. (Provider secrets are wired as before, from the `socialProviders`
  keys, so they appear in the credentials map.)
- **cucumber**: `Actor` gains an additive cookie jar — `cookieFetch` (a
  `customFetchImpl` that replays stored cookies, stamps `Origin`, and captures
  `Set-Cookie`), plus `cookieHeader`, `storeSetCookie`, and `clearCookies`. This
  lets a cucumber actor drive a real cookie-backed session (e.g. the Better Auth
  client SDK) instead of hand-rolling a jar per suite. The existing JWT/bearer
  actor behaviour is unchanged.
