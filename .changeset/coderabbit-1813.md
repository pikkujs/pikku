---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/better-auth': patch
'@pikku/openapi-parser': patch
---

Review fixes for the OpenAPI addon onboarding:

- A delegated sign-in whose email the upstream did not return, including a login typed as an email, never links to an existing user. An authenticator that omits `syntheticEmail` counts as synthetic.
- `pikkuActor` credentials take an optional `remove`, which drops a credential the environment no longer sets. The actor log line names the user id, not the email.
- Basic credentials are UTF-8 encoded, and a Swagger 2 `application` OAuth flow keeps its token URL.
- `pikku new addon` writes a `file:` path relative to each package when the app is not a workspace, and reports an auth.ts factory it cannot edit instead of half-wiring it.
- The inspector reads an addon from the package that declares it before the root.
- The dev credentials key file is created exclusively, so two `pikku dev` processes agree on one key.
