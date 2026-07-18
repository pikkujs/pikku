---
'@pikku/better-auth': patch
---

`betterAuthSession` now checks the live session, not the wire's stale snapshot, before re-resolving.

The middleware skipped when a session was already present, but it read the wire's
static `session` field — a snapshot taken at wire construction that a prior
middleware's `setSession` never updates (that writes the session service). So when an
app registered its own `betterAuthSession` first (e.g. to enrich the session with a
role via `mapSession`, or to resolve impersonation) and the generated
`betterAuthSession()` ran after it, the guard saw no session and re-resolved with the
default map — clobbering the enriched session with a bare `{ userId }`. The guard now
reads `getSession()`, so the second middleware correctly steps aside and the first
middleware's session survives.
