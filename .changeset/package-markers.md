---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/core': patch
'@pikku/knowledge': patch
'@pikku/vite': patch
---

`srcDirectories` is no longer read (the loader accepts and ignores it). A project's packages are found by role markers instead of keys in the root config: the root `pikku.config.json` holds every setting, and a workspace package's own `pikku.config.json` is only a marker. `"main": true` marks the one package that owns the wirings and services (inspected in place by the root); an `"addon"` section with a `"namespace"` marks each addon. The root finds them in its package.json `workspaces`, never in `node_modules`, `.pikku`, `dist` or a nested fixture. Zero or one `main` is allowed (a project with none is its own main); two is an error naming both, and so is a workspace package config with neither marker or with both. `base` and `addons` in the root config are refused with a message pointing at the markers. Root `pikku all` runs each addon in dependency order, then the main package, then assembles the backend SDKs; a backend filter can select an addon with `names: ["<namespace>:*"]`. The inspectors take a `baseDir` and PKU368 reports an addon service the project's `SingletonServices` does not provide (a wire service does not count), for every function of the addon. A `wireAddon` is matched to an addon by package: exactly one call may point at each addon, under its `namespace`; a different name or a second call is an error, an addon nothing wires is a warning. The scaffold and `pikku new` files are written in the main package. `pikku validate` checks the root, not the main package, as the project. See docs/MIGRATION.md.
