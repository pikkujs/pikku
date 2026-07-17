---
'@pikku/addon-console': patch
---

feat: role and scope management functions

Adds functions over `ScopeService` for listing the declared scope vocabulary,
composing roles from it, and granting roles to users. Grants take effect on the
user's next request — no re-login.

These are self-hosting: the console declares its own `pikku:scopes:read` and
`pikku:scopes:manage` scopes and requires them, so being able to reach the
console is not the same as being able to grant yourself anything.
