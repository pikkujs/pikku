---
'@pikku/core': patch
'@pikku/skills': patch
---

`authBearer` accepts an optional `verify(token, services)` hook for opaque, hashed or revocable tokens. A `null` result or a throw answers 401 (fail closed). Existing JWT and static-token modes are unchanged.
