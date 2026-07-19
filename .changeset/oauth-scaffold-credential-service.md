---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/openapi-parser': patch
---

Migrate the `--oauth` addon scaffold off `OAuth2Client`. A scaffolded OAuth2
addon service used to construct `new OAuth2Client(config, appCredentialSecretId,
secrets)` and do its own token exchange/refresh — the responsibility better-auth
now owns via the credential service. The `pikku new addon --oauth` scaffold (and
the OpenAPI `--openapi` generator) now emit a service that receives a ready
access token: `services.ts` uses `createWireServices` + `wire.getCredential<{
accessToken: string }>(name)` and the service does a plain `fetch` with
`Authorization: Bearer ${accessToken}`, matching the existing per-user
bearer/apikey credential scaffold. With no remaining consumers, `OAuth2Client`
(`@pikku/core/oauth2`) and its test are removed; the `./oauth2` export keeps the
`OAuth2AppCredential` / `OAuth2Token` types.
