---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Refuse better-auth's `admin()` plugin, and point at `ban()`.

`admin()` authorizes its endpoints against a `user.role` column while pikku
authorizes on scopes, so wiring it means running two authorization models and
projecting one onto the other — coarsely, since any single `admin:users:*` scope
has to project to `role='admin'` and thereby unlocks every one of its endpoints
underneath. Pikku dropped that projection when user management moved to
`@pikku/addon-admin`'s scoped RPCs, so nothing reads the column any more.

The inspector now throws when `admin()` appears in a `betterAuth({ plugins })`
array, naming the replacement:

```ts
import { ban } from '@pikku/better-auth'
betterAuth({ plugins: [ban()] })
```

`ban()` keeps the one capability `admin()` had that pikku cannot supply from
outside better-auth: the `banned`/`banReason`/`banExpires` columns and the
session hook that refuses a banned user a session.

`pikku validate` reports the same thing without a prebuild, and additionally
warns about the quieter half of the migration — an app that dropped `admin()`
and never wired `ban()`, which keeps its ban columns and its ban UI while
silently enforcing nothing.

Both resolve the plugin's provenance before applying the policy: the entry has
to be better-auth's `admin`, imported from `better-auth/plugins` — by name, by
alias or through a namespace — and actually present in the `plugins` array. A
project's own helper called `admin` passes, and an import left behind after the
call was removed configures nothing.
