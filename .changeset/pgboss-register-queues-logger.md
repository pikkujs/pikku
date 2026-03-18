---
"@pikku/queue-pg-boss": patch
---

Accept optional logger parameter in `registerQueues()` instead of reaching into pikku state directly. Falls back to `getSingletonServices()` for backwards compatibility.
