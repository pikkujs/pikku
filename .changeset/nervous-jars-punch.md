---
'@pikku/cli': patch
---

fix: ship an addon's secrets and variables metadata

An addon's `pikku-secrets-meta.gen.json` and `pikku-variables-meta.gen.json`
never reached its published package, so a host installing the addon could not
discover its declared secrets or variables — the inspector's addon loaders
silently found nothing.

TypeScript only emits a `.json` into the build output when something imports it,
and an addon publishes only that output. The generated `pikku-secrets.gen.ts`
and `pikku-variables.gen.ts` now import their sidecars and re-export them as
`SECRETS_META` / `VARIABLES_META`, so the metadata ships.
