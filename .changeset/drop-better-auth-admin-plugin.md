---
'@pikku/better-auth': patch
'@pikku/addon-admin': patch
'@pikku/console': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Drop better-auth's `admin()` plugin.

`admin()` bundles three unrelated things: a `role` column, fifteen HTTP
endpoints authorized against that column, and the enforcement that stops a
banned user from getting a session. Pikku only ever wanted the third. The
endpoints were never reachable directly — each sat behind a pikku function with
its own `admin:users:*` scope — so all the plugin added was a second gate on a
column that had to be kept in step with the scopes it duplicated. That sync
(`syncProjectedAdminRole`, run on every authenticated request) is now gone
along with the column.

User administration is implemented against better-auth's internal adapter
instead, exported from `@pikku/better-auth` so `@pikku/addon-admin` and the
`scaffold.userAdmin` generator share one implementation:

```ts
import {
  createAuthUser,
  deleteAuthUser,
  revokeAuthUserSessions,
  setAuthUserBanned,
  setAuthUserPassword,
} from '@pikku/better-auth'
```

Ban keeps its schema and its enforcement, in a plugin that does nothing else:

```ts
import { ban } from '@pikku/better-auth'

betterAuth({ plugins: [ban()] })
```

`ban()` adds `banned`, `banReason` and `banExpires` to `user`, refuses to create
a session for a banned user, and lapses an expired ban at the sign-in that would
otherwise be refused. It makes no authorization decision of its own, so it never
needs to know about scopes.

Breaking:

- Remove `admin()` from your better-auth `plugins`, and add `ban()` if you ban
  users. `pikku db generate` writes the migration; `user.role` and
  `session.impersonatedBy` are no longer declared by anything.
- `callAdminApi`, `AdminApiHttpWire`, `syncProjectedAdminRole`,
  `projectedAdminRole` and `ADMIN_ROLE_SCOPES` are removed. `ADMIN_SCOPES`,
  `ADMIN_SCOPE_ROOT` and `ADMIN_SCOPE_TREE` are unchanged.
- The `scaffold.userAdmin` codegen no longer fails without `admin()`. It now
  fails only when there is no better-auth at all, and warns when `ban()` is
  missing — banning is one capability of six, so the other five still generate.
- The scope on each function is now the whole authorization decision. Anywhere
  that relied on `user.role` as a backstop no longer has one.
