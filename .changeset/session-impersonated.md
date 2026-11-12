---
'@pikku/core': patch
'@pikku/better-auth': patch
---

A session can carry `impersonated?: { by: string }`, the id of the real user acting as the session's user. better-auth's impersonation sets it from the caller it resolves, after `mapSession`. A function span records `pikku.impersonated` (boolean `true`) and `pikku.impersonated.by` when it opens, and a log line written inside the span carries them too; a session that is not impersonated has neither.
