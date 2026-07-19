---
'@pikku/core': patch
'@pikku/inspector': patch
---

`wireAddon` can install one addon package as multiple named instances, each with its own per-instance singleton services and `secretOverrides`/`variableOverrides`/`credentialOverrides` that alias logical names to real project secrets/variables/credentials.
