---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/deploy': patch
---

`defineProvider` replaces contributors. `@pikku/core/provider` exports `defineProvider`, `ProviderRegistry`, `runProviders` and `ProviderError`; `@pikku/core/contributors` is removed. A provider is a factory that destructures what it needs from `services` and returns what it provides, the same on every target or per `dev`, `deploy` and `common` variant. `wireAddon({ providers })` replaces `contributors`. `stopSingletonServices` stops services in reverse of the order they were built, and `ContributorServerHook` is now `ServiceServerHook`. The inspectors read providers as `providers` and `optedInProviders`, and an addon publishes `{ metaVersion: 2, providers, collections }` at `providers/pikku-providers-meta.gen.json`; PKU360 to PKU364 are retired and PKU369 to PKU376 (except PKU370) are provider codes. See docs/MIGRATION.md. The CLI resolves providers once for `pikku dev` and each deploy unit, generates a runner per target and `#pikku/provider` with the merged `SingletonServices`, and replaces the contributors command and config keys. `@pikku/deploy` replaces `contributorSupport` with `serviceSupport`.
