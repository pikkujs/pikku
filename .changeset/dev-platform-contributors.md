---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku dev` takes the same platform-service contributors a deploy does. List modules exporting a `PlatformServiceContributor` under `dev.contributors` in `pikku.config.json`; `pikku all` writes `.pikku/pikku-dev-platform-services.gen.ts` from them (nothing when none are configured), and `pikku dev` merges its `createPlatformServices(env)` over the local services before `createSingletonServices`, so a host can inject an `emailService` into a running project. `pikku serve` never loads it and `NODE_ENV=production` ignores it.
