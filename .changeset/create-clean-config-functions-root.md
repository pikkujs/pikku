---
'@pikku/create': patch
---

`cleanPikkuConfig` strips a `../functions` `rootDir` and rewrites the `../functions/tsconfig.json` reference, so templates copied out of `recipes/` no longer point outside the new project.
