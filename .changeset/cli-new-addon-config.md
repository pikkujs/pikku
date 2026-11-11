---
'@pikku/cli': patch
---

`pikku new addon` no longer writes the removed `outDir` key, accepts a header option passed as a single string, and `addon.openapi` config accepts `camelCase` and `authConfig`, which the generator emits.
