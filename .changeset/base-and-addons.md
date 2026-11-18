---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/core': patch
---

`srcDirectories` is replaced by two keys: `base`, the one package that owns the wirings and services (inspected in place by the root), and `addons`, the addon directories each with a required `namespace`. Root `pikku all` runs the addons in dependency order, then the base, and assembles the backend SDKs; a backend filter can select an addon with `names: ["<namespace>:*"]`. The inspectors take a `baseDir` and PKU368 reports an addon service the project's `SingletonServices` does not provide (a wire service does not count), for every function of the addon. A `wireAddon` is matched to an addon by package: a different name than the addon's `namespace` is an error, an addon nothing wires is a warning. The base lives inside the config directory, and the scaffold and `pikku new` files are written in it. `pikku new addon` writes a `namespace`. See docs/MIGRATION.md.
