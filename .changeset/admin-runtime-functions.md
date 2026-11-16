---
'@pikku/addon-admin': patch
'@pikku/addon-console': patch
'@pikku/better-auth': patch
---

The secret, variable, installed-addon, scorer and access functions move from `@pikku/addon-console` to `@pikku/addon-admin` and are deleted from the console: `admin:secretGet|secretHas|secretSet`, `admin:variableGet|variableSet`, `admin:getInstalledAddons`, `admin:getAddonInstances`, `admin:getScorers` and `admin:getMyAccess`. Secrets, variables and addon reads are gated by the new `admin:secrets:read|write`, `admin:variables:read|write` and `admin:addons:read` scopes (also added to `ADMIN_SCOPE_TREE`), replacing `pikku:console:secrets:*`, `pikku:console:variables:*` and `pikku:console:addons:read` for these functions. The console's `startVirtualUserRun` and `setVirtualUserSchedule` pass-throughs are deleted; call the host functions directly. The addon forwards the host's `secrets`, `variables` and `metaService`. See docs/MIGRATION.md.
