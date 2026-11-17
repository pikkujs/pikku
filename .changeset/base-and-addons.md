---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/core': patch
---

`srcDirectories` is replaced by two keys: `base`, the one package that owns the wirings and services (inspected in place by the root), and `addons`, the addon directories each with a required `namespace`. Root `pikku all` runs the addons in dependency order, then the base, and assembles the backend SDKs; a backend filter can select an addon with `names: ["<namespace>:*"]`. The inspectors take a `baseDir` and PKU368 reports an addon function whose parent service the project's `SingletonServices` does not declare. See docs/MIGRATION.md.
