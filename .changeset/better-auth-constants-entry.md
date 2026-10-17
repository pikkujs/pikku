---
'@pikku/better-auth': patch
'@pikku/cli': patch
---

`@pikku/better-auth/constants` exports the provider and plugin registries, OAuth proxy ids and virtual-user env names without loading the better-auth library. The CLI reads them from there, so it no longer loads better-auth on every command: `pikku --help` 0.53s → 0.43s.
