---
'@pikku/console': patch
---

feat(console): admin login gate + user impersonation

Adds an admin-gated login flow and user impersonation to the console:

- `AuthGate` / `LoginScreen` / `NotAuthorized` — gate the console behind a
  signed-in session and surface a clear "not authorized" state for non-admins.
- `AdminUsersPage` driven by the Better Auth `adminClient` (`listUsers` /
  `setRole`).
- `ImpersonationContext` + `ImpersonationBanner` / `ImpersonateDrawer` — an
  admin can act as another user. The selected target's id is sent as the
  `x-pikku-impersonate-user-id` header via `@pikku/fetch`'s `setHeader`, and is
  threaded through the agent-chat and workflow-run RPC calls so impersonated
  requests are scoped end to end. Pairs with the backend `betterAuthSession({ impersonation })` support.
