---
'@pikku/console': patch
---

Export `AuthContext` so a host without a console login of its own can supply the auth value directly.

`AdminUsersPage`, `useAdminUsers` and the user action menus and drawers all read `useAuth()` for the caller's identity, their scopes and the `pikkuAdmin*` user-admin calls. That value only ever came from `AuthProvider`, which builds it from a Better Auth cookie session on `{serverUrl}/api/auth` — so a host embedding these pages without such a session got a thrown `useAuth must be used within an AuthProvider` rather than a degraded page. Fabric is the case in hand: it reaches a sandbox with a bearer token that the app already maps to a scoped session, so it has both a user and scopes, just not a cookie to fetch them with.

`AuthContext` now joins `PikkuRPCContext` and `ConsoleNavigatorCtx` as a context a host may provide itself. `AuthProvider`, `useAuth`, `useOptionalAuth`, the `AuthContextValue` and `AuthUser` types, and `createConsoleAuthClient` (which builds the `client` the value requires) are exported alongside it. Nothing about the standalone console changes — it still mounts `AuthProvider` and reads the same context.
