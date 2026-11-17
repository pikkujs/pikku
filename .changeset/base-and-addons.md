---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/core': patch
---

`srcDirectories` is replaced by `pikkuDirectories`. Root `pikku all` runs each listed package in dependency order and assembles the backend SDKs. A backend filter can select an addon with `names: ["<namespace>:*"]`. See docs/MIGRATION.md.
