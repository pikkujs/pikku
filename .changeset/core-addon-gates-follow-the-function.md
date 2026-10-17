---
'@pikku/core': patch
---

`wireAddon({ scopes, auth, tags })` are applied from the package the function belongs to rather than the package of the wire that reached it. A `wireHTTP({ func: ref('ns:fn') })` route records no package, so for it the addon's scope floor, `auth: true` and tag middleware were all skipped, and a public route to a public addon function was reachable with no session (#1362).
