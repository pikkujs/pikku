---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
'@pikku/skills': patch
---

Contributors are removed, with `@pikku/core/contributors`, `wireAddon({ contributors })`, the contributors command and config keys, and a deploy provider's `contributorSupport`. Services are ordinary code in three layers: a host's platform services (`createPlatformServices`, named by a deploy provider's `platformServicesModule(ctx)` or by `--platform-services`), `pikkuServices` and `pikkuWireServices`. Only the platform layer receives the raw environment. A `kysely` the platform module returns gets the app's column coercion map. See docs/MIGRATION.md.
