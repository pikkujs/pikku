---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/openapi-parser': patch
---

Make `wireCredential` the single source of truth for an addon's OAuth2 config: `pikku-credentials.gen.ts` exports `CREDENTIAL_OAUTH2_CONFIGS`, generated services import from it, the OpenAPI importer emits a `wireCredential`, and the inspector now extracts `oauth2.additionalParams`.
