---
'@pikku/inspector': patch
---

An addon's metadata now resolves from the package that calls `wireAddon`, as well as from the repo root, so a workspace addon listed only in `packages/functions` loads. When it still cannot be found, the warning names the package, the directories tried and the fix: add the dependency and install, or build the addon if it is installed but has no generated metadata.
