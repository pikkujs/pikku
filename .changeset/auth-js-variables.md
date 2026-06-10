---
'@pikku/auth-js': patch
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/redis': patch
'@pikku/aws-services': patch
'@pikku/kysely': patch
'@pikku/mongodb': patch
---

feat(auth-js): wire OIDC config (issuer/tenantId) as variables, expand provider registry

- Move `issuer` and `tenantId` out of the secret blob for OIDC providers (auth0, okta, azure-ad, keycloak, cognito, microsoft-entra-id) — they are public config URLs, not secrets. Now registered via `wireVariable` and loaded at runtime via `services.variables.get()`.
- Expand provider registry from 13 to 31 providers: reddit, notion, instagram, zoom, figma, tiktok, threads, patreon, dropbox, bitbucket, hubspot, salesforce, atlassian, strava, keycloak, cognito, microsoft-entra-id added.
- `serialize-auth-gen` emits `wireVariable({...})` declarations and `services.variables.get()` calls in the generated factory for OIDC providers.
- Integration verifier exercises real `/auth/providers` endpoint with `LocalSecretService` + `LocalVariablesService`, including a spy test proving `services.variables.get('AUTH0_ISSUER')` is called at request time.
