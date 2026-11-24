---
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
---

`@pikku/deploy-cloudflare` and `@pikku/deploy-standalone` implement `serviceSupport(ctx)`, `{ baseline, runsServerLifecycle }`, and their entries call the generated per-unit runner. A Cloudflare container runs the server lifecycle and a Worker does not. `STANDALONE_BINDING_SOURCES`, `CLOUDFLARE_BINDING_SOURCES`, `coercionContributor`, `COERCION_CONTRIBUTOR_NAME` and the Cloudflare adapter's `coercion` option are removed. See docs/MIGRATION.md.
