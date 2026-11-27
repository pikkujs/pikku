---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/cloudflare': patch
'@pikku/core': patch
---

A host can supply platform services from one module exporting `createPlatformServices(env, services, { requiredServices })`: a deploy provider names it with `platformServicesModule(ctx)`, and whoever starts `pikku dev` or `pikku serve` passes it with `--platform-services <module>`. On Cloudflare Workers, Cloudflare containers and the server entry, platform services are now built before `createConfig`, which receives the `variables` they provide. `pikkuPlatformServices` from `@pikku/core/lifecycle` types that module's function.
