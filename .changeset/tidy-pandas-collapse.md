---
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/better-auth': patch
---

Retire the `scaffold.userAdmin` generator in favour of `@pikku/addon-admin`, and
point the console's user directory at it.

The generator and the addon shipped the same six operations — list, create, ban,
remove, revoke-sessions, set-password — over the same `admin:users:*` scopes and
the same `@pikku/better-auth` implementation, differing only in what the RPCs
were called. The console named the generator's spelling, `pikkuAdminListUsers`
and its siblings, so the addon that superseded it had no caller at all: wiring
`@pikku/addon-admin` into an app left the Users page as dead as before.

The console now calls `admin:listUsers`, `admin:createUser`,
`admin:setUserBanned`, `admin:removeUser`, `admin:revokeUserSessions` and
`admin:setUserPassword` — the addon under the `admin` namespace that
`wireAddon({ name: 'admin', package: '@pikku/addon-admin' })` gives it, the same
convention by which the console reaches its own addon as `console:*`.

To migrate, drop `userAdmin` from the `scaffold` block of `pikku.config.json` and
wire the addon once, anywhere under your functions source:

```ts
import { wireAddon } from '#pikku/addon'

wireAddon({ name: 'admin', package: '@pikku/addon-admin' })
```

`pikku all` deletes the generated `admin/user-admin.gen.ts` and its schemas on
the next run. That deletion is not tidying: left on disk the file keeps
registering the old six, so an app that installed the addon would answer to two
spellings of the same calls. `pikku validate` already fails an app with a console
and no admin addon wired, and names this wiring in the fix.

A host driving these operations from its own hand-written functions is
unaffected — the implementations still live in `@pikku/better-auth`, which is why
the addon needed none of its own.
