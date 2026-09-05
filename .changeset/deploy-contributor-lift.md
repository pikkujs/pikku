---
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
---

Lift `PlatformServiceContributor` into `@pikku/deploy` so any provider adapter
can accept the same service contributors.

A contributor now declares the binding sources its emitted code reads from
(`requires`, defaulting to `env`). An adapter that cannot provide one of them
refuses the contributor by name at construction instead of silently emitting
code that reads bindings the runtime never has.

`@pikku/deploy-cloudflare` keeps its entry output unchanged and re-exports the
type from the core package. The container entry it generates now runs only the
contributors that live on `env`. `@pikku/deploy-standalone` gains a
`contributors` option: both the node and bun entries build the contributed
services from `process.env` and spread them last into
`createSingletonServices`, so a contributed service overrides the in-process
default.
