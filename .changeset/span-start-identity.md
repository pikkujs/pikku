---
'@pikku/core': patch
---

A function span carries `pikku.user.id` and `pikku.org.id` from the moment it opens, when the wire's session already has them, so a reader filtering by tenant sees spans that never reach their end. The end-of-span write still sets them when a middleware establishes the session later.
