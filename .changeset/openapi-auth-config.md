---
'@pikku/openapi-parser': patch
---

Support an operator-supplied auth config that overrides/augments a spec's securitySchemes: custom auth header name/format (e.g. a raw token in `authentication:` instead of `Authorization: Bearer`), and a delegated-login descriptor (login path, credential fields, token dot-path, claims mapping from the decoded JWT payload or response body) that emits a self-contained `src/<name>-upstream-auth.ts` `authenticate<Name>Upstream()` for wiring into `@pikku/better-auth`'s `delegatedAuth()` plugin.
