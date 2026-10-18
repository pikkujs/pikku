---
'@pikku/cli': patch
---

The scaffolded `virtualUserPlatformSession` now finds the platform user by its reserved address (`findPlatformUserId` from `@pikku/better-auth`). Before this, scheduled virtual-user ticks always ran as the hardcoded `userId: 'pikku-platform'`, which matches no user row when better-auth generates `uuid` or `serial` ids. Until the platform user exists, or when the app has no `auth` service, the session falls back to `'pikku-platform'`.

`scaffold.virtualUser` now requires `@pikku/better-auth`. The generated file imports it unconditionally, and `pikku all` adds it to the `package.json` that owns the generated file when it is not already listed (the way a generated channel client adds `@pikku/websocket`), so run your package manager's install afterwards. Before, a project without `pikkuBetterAuth` got a second form of the middleware with the literal id, which differed only because of that branch; the sign-in plugin, the provisioning and the platform user are all better-auth's.
