---
'@pikku/inspector': patch
---

Exclude `node_modules` from inspector source scanning. A locally-installed addon (under the project's `node_modules`) is a dependency, not project source — scanning it double-counted the addon's own application types (`CoreConfig`/`CoreServices`/`CoreSingletonServices`) and failed `pikku all` with "More than one … found". Addons still contribute via their generated metadata, not by being re-scanned as source.
