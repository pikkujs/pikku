---
'@pikku/addon-graph': patch
---

`graph:httpRequest` gains an optional `auth` descriptor (bearer/apiKeyHeader/apiKeyQuery/basic) resolved from the `SecretService` at request time; `oauth2` is a guarded not-yet-supported error.
