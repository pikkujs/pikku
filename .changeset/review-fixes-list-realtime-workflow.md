---
'@pikku/skills': patch
---

Three review fixes across the wiring skills: pikku-list-query now caps `limit` and reads `filter` as the recursive AND/OR tree it is (a `'status' in filter` check silently returns unfiltered rows for a group or an operator leaf); pikku-realtime warns that `/events/:topic` is unauthenticated so a topic must carry a projection rather than `returningAll()`, and invalidates the `[name, input]` query key instead of hand-patching a `ListOutput`; pikku-workflow replaces "each step is its own transaction" — pikku opens none — with where atomicity actually comes from, plus provider idempotency keys for retried external side effects.
