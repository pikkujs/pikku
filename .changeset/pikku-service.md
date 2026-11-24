---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/deploy': patch
---

`pikkuService` replaces contributors. `@pikku/core/pikku-service` exports `pikkuService`, `ServiceRegistry`, `runPikkuServices` and `PikkuServiceError`; `@pikku/core/contributors` is removed. A service is a factory that destructures what it needs from `services` and returns what it provides, the same on every target or per `dev`, `deploy` and `common` variant. `wireAddon({ services })` replaces `contributors`. `stopSingletonServices` stops services in reverse of the order they were built, and `ContributorServerHook` is now `ServiceServerHook`. The inspectors read services as `pikkuServices` and `optedInServices`; PKU360 to PKU364 are retired and PKU369 to PKU374 are new. See docs/MIGRATION.md. The CLI resolves services once for `pikku dev` and each deploy unit, generates a runner per target and `#pikku/service` with the merged `SingletonServices`, and replaces the contributors command and config keys. `@pikku/deploy` replaces `contributorSupport` with `serviceSupport`.
