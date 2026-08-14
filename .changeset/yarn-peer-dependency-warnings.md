---
'@pikku/kysely-bun-sqlite': patch
---

Declare `@pikku/core` as a peer dependency, matching `@pikku/kysely-sqlite`.

The package depends on `@pikku/kysely-sqlite`, which requires `@pikku/core` as a
peer, but never declared that requirement itself — so an install resolved
without complaint and the missing peer only surfaced at runtime. It is now
declared the same way its sibling declares it.
