---
'@pikku/cli': patch
---

`pikku new addon --auth-config <path>`: pass an auth-config JSON that overrides the spec's securitySchemes (custom auth header, delegated login). With a `delegated` section the credential mode is forced to `bearer`, the generated per-user services check token expiry (`UnauthorizedError` re-auth signal), the credential schema carries `{ token, expiresAt?, tenantId? }`, and the addon exports a ready `authenticate<Name>Upstream()` for `@pikku/better-auth`'s `delegatedAuth()` plugin.
