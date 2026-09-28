---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku validate` reports app code importing `@pikku/core`

`#pikku` is the app's API and `@pikku/core` is the ecosystem's, so a name taken
from core is the untyped copy of one the alias hands over already typed against
the project. The new `coreImport` lint rule reports it, naming the `#pikku` leaf
that carries the name. `@pikku/core/services` stays exempt — the service
implementations bootstrap picks are a choice, not a wiring — as does
`application-types.d.ts`, which is codegen's input. Set
`"lint": { "coreImport": "off" | "warn" }` to lower or silence it.
