---
'@pikku/core': patch
'@pikku/better-auth': patch
---

A function requiring a live scope now runs its permissions, body and nested calls on the freshly resolved scopes, not only its scope check. better-auth reads the session secret only when the scopes cache is used, and skips the cache cookie when a snapshot would not fit in one.
