---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

An addon can ship screens: `wireAddon({ ui: true })` mounts what the package declares with `defineScreens`, the inspector reads them, `pikku all` emits the screens manifest and the installed-addons registry, and `x-pikku-addon` narrows a session to the addon's role. `pikku new addon --ui` scaffolds one; its tables must be prefixed `<name>_`.
