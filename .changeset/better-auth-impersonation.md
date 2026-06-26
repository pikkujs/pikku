---
"@pikku/better-auth": patch
---

Add an optional `impersonation` config to `betterAuthSession` (and the stateless variant). When configured, a request carrying the impersonation header (default `x-pikku-impersonate-user-id`) and passing the `canImpersonate` gate resolves the session as the target user via `loadUser`; unknown targets fall back to the real caller with a warning, self-impersonation is a no-op, and the header is inert when impersonation is not configured. Lets an admin act as another user without a bespoke middleware.
