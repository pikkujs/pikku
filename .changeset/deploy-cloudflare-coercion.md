---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
---

`@pikku/deploy-cloudflare` applies the generated column coercion map, as `pikku dev` does.

The adapter now ships `coercionContributor`, on by default: when `db/coercion.gen.ts` exists, every entry's `createPlatformServices` wraps the platform's `services.kysely` with `createCoercionPlugin` and the map as a literal. It runs after every other contributor so it wraps the kysely they built. A platform whose own contributor already applies the map passes `coercion: false`.

`EntryGenerationContext` gains `coercionMap`, filled by the deploy build from the project's `coercion.gen.ts`, and a contributor's `imports` function now receives the entry context as a second argument (`collectContributorImports` takes it as a third).
