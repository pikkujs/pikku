---
'@pikku/deploy': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/deploy-standalone': patch
'@pikku/deploy-cloudflare': patch
'@pikku/skills': patch
---

Platform service contributors declare `needs` and `provides` and run in the order those require; an unmet need, a key provided twice or a cycle fails codegen by name. Generated `createPlatformServices(env, runtime)` receives the services the entry already built (`runtime.kysely` on standalone, after the database opens). Addons ship contributors in their package.json under `pikku.contributors`, picked up by `pikku dev` codegen and by `pikku deploy plan` / `apply`, which now also pass `deploy.contributors` from `pikku.config.json` to the adapter.
