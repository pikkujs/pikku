---
'@pikku/cli': patch
---

The scaffolded `virtualUserPlatformSession` now finds the platform user by its reserved address (`findPlatformUserId` from `@pikku/better-auth`) when the project uses `pikkuBetterAuth`. Before this, scheduled virtual-user ticks always ran as the hardcoded `userId: 'pikku-platform'`, which matches no user row when better-auth generates `uuid` or `serial` ids. Until the platform user exists, the session falls back to `'pikku-platform'`. Projects without better-auth generate the same code as before.
