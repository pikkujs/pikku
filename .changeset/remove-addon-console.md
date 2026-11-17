---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/addon-admin': patch
---

`@pikku/addon-console` is removed from the repository and will no longer be published. The CLI drops everything that supported it: `scaffold.console` and its generated files, `pikku enable console`, the `PIKKU_CONSOLE_TOKEN` bearer middleware in the generated auth wiring, the console steps of `pikku ci`, the `/console/knowledge` link in `pikku knowledge plan` output, and the `pikku:console` scope from the studio session (it is now `['admin']`). What remains of the console's functions moves to Pikku Studio. See docs/MIGRATION.md.
