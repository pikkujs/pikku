---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Breaking: `pikkuStudio` is now `definePlugin`. An addon declares the screens and nav it brings to Studio with `definePlugin({ title, screens })` from `@pikku/core/addon`. The manifest shape is unchanged; rename the import and the call. `pikku new addon-ui` scaffolds the new name.
