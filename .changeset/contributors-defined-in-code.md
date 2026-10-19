---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Platform-service contributors are plain objects an addon registers with `defineContributors` (new `@pikku/core/contributors`) and a project opts in to by name with `wireAddon({ contributors })`. `dev.contributors`, `deploy.contributors`, addon `pikku.contributors`, the string-emitting `PlatformServiceContributor` API and its helpers, the adapter `contributors` option and the `devPlatformServicesFile` config output are removed, and a leftover one is a hard error: the CLI refuses the config keys by name and the inspector reports an addon `package.json` with `pikku.contributors` as PKU358 (see `docs/MIGRATION.md`). Contributors can declare `onServerStart` / `onServerStop`, run around the app's server lifecycle in `pikku dev`, `pikku serve`, the generic server entry, standalone and the Cloudflare container entry (which now runs the app's own `serverLifecycle`); on a Worker `onServerStart` is a build error. `ProviderAdapter.contributorSupport` gains a required `runsServerLifecycle`. `@pikku/core` is a new peer dependency of the deploy packages and `@pikku/kysely` of `@pikku/deploy-cloudflare`.
