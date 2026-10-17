---
'@pikku/cli': patch
---

The `coercion.gen.ts` header no longer says nothing applies the map. It names where it is applied — `pikku dev` / `serve` / the local CLI, standalone deploys and `@pikku/deploy-cloudflare`'s `coercionContributor` — and warns against attaching it a second time to that kysely, since the plugin is not idempotent for json columns.
