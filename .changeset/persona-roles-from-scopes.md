---
'@pikku/core': patch
---

Verify a persona's roles against the app's own `getMyScopes` RPC before better-auth's `user.role`. In an app that authorizes on scopes that column is a projection — kept in step for better-auth's own admin endpoints, and absent entirely from an app that declares no such field — so a persona holding exactly what it should was refused for "roles drifted". Configurable via `rolesRpc`; `false` reads better-auth only.
