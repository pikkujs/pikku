---
'@pikku/core': patch
'@pikku/better-auth': patch
---

A session can carry `impersonated?: { by: string }`, the id of the real user acting as the session's user. better-auth's impersonation sets it from the caller it resolves, after `mapSession`. A function span records `pikku.impersonated` (boolean `true`) and `pikku.impersonator.id` when it opens (and again just before the function body, for a session a middleware sets later), and a log line written inside the span carries them too; a session that is not impersonated has neither. `Span` gains an optional `removeAttribute`; `PikkuSessionService.set` never stores `impersonated`; the OTLP logger drops logged fields named like its context attributes.
