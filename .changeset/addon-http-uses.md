---
'@pikku/core': patch
---

A call over HTTP that names an add-on in `x-pikku-addon` can only reach that add-on's own functions and the add-ons it lists in `uses`. `rpc.exposed` now refuses anything else, including host functions and an add-on nobody wired, and `AddonNotUsedError` answers 403.
