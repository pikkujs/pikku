---
'@pikku/core': patch
'@pikku/inspector': patch
---

HTTP routes wired with `ref('ns:fn')` now record the addon function id as their own `pikkuFuncId`, the same way the CLI and channel wirings already do, instead of minting a per-route wrapper function and linking it back through `refTarget`. The `refTarget` field is gone from `HTTPWiringMeta`, and the runtime resolves a namespaced route function against the addon package's own metadata.
