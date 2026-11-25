---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
'@pikku/cloudflare': patch
'@pikku/ai-vercel': patch
'@pikku/skills': patch
'@pikku/addon-altcha': patch
'@pikku/addon-kysely': patch
'@pikku/addon-kysely-postgres': patch
'@pikku/addon-kysely-mysql': patch
'@pikku/addon-kysely-sqlite': patch
'@pikku/addon-kysely-bun-sqlite': patch
'@pikku/addon-kysely-node-sqlite': patch
'@pikku/addon-queue-nats': patch
---

`defineProvider`, `defineWireProvider` and `defineProviderCollection` from `@pikku/core/provider` replace contributors. A provider is a factory that destructures what it needs from `services` and returns what it provides, the same on every target or per `dev`, `deploy`, `deploy:<profile>` and `common` variant, with `optional` needs, `replaces` for the protected keys (`secrets`, `variables`, `credentialService`, `auth`, `jwt`, `logger`) and `addTo` to contribute one item to a collection. A wire provider is built once per invocation from `(singletons, wire)` and stopped in reverse order; `closeWireServices` is now `stopWireServices` and a per-request service's `close()` is `stop()`. `wireAddon({ providers })` opts in by name, `wireRemoteAddon({ providers })` is PKU381, an addon provider reads only the variables and secrets its addon declares, and `pikku-addons.lock` records each addon provider's surface (PKU395, `--approve-providers`, `--frozen`, implied by `CI=true`, PKU396). `analyticsSinks` is a core collection and `AnalyticsSinkRegistry` and `createAnalyticsSinks` are removed. The CLI resolves providers once for `pikku dev` and each deploy unit, generates a runner per target and `#pikku/provider`, and checks that every function's needs are provided (PKU390). `@pikku/deploy` replaces `contributorSupport` with `serviceSupport`, which also reports `profile` and `entryOwned`. The kysely packages and `@pikku/queue-nats` move to `packages/addon` and are renamed `@pikku/addon-kysely`, `@pikku/addon-kysely-postgres`, `-mysql`, `-sqlite`, `-bun-sqlite`, `-node-sqlite` and `@pikku/addon-queue-nats`, each exporting a provider. The skills describe the new surface. See docs/MIGRATION.md and docs/services.md.
