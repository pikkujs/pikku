---
'@pikku/addon-admin': patch
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/core': patch
---

The secret, variable, installed-addon, scorer and access functions move from the console addon to `@pikku/addon-admin`: `admin:secretGet|secretHas|secretSet`, `admin:variableGet|variableSet`, `admin:getInstalledAddons`, `admin:getAddonInstances`, `admin:getScorers` and `admin:getMyAccess`. Secrets, variables and addon reads are gated by the new `admin:secrets:read|write`, `admin:variables:read|write` and `admin:addons:read` scopes (also added to `ADMIN_SCOPE_TREE`), replacing `pikku:console:secrets:*`, `pikku:console:variables:*` and `pikku:console:addons:read` for these functions. The console's `startVirtualUserRun` and `setVirtualUserSchedule` pass-throughs are gone; call the host functions directly. The addon forwards the host's `secrets`, `variables` and `metaService`. See docs/MIGRATION.md.

`@pikku/addon-console` is removed from the repository and will no longer be published. The CLI drops everything that supported it: `scaffold.console` and its generated files, `pikku enable console`, the `PIKKU_CONSOLE_TOKEN` bearer middleware in the generated auth wiring, the console steps of `pikku ci`, the `/console/knowledge` link in `pikku knowledge plan` output, and the `pikku:console` scope from the studio session (it is now `['admin']`). What remains of the console's functions moves to Pikku Studio. See docs/MIGRATION.md.
