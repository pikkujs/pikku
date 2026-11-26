---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/cloudflare': patch
---

A host can supply platform services from one module exporting `createPlatformServices(env, services, { requiredServices })`: a deploy provider names it with `platformServicesModule(ctx)`, and `devPlatformServices` in `pikku.config.json` names it for `pikku dev` and `pikku serve`. On Cloudflare Workers, Cloudflare containers and the server entry, platform services are now built before `createConfig`, which receives the `variables` they provide.
