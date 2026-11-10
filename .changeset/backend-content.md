---
'@pikku/cli': patch
---

`content` declares buckets. Root `content` is `{ contentPath, sizeLimit, buckets }` (shared directory, limit and every bucket); `backends.<name>.content` is `{ buckets, uploadUrlPrefix, assetUrlPrefix }` (the buckets that backend may use and its own route prefixes). A backend with no `content` has none, and the loader refuses undeclared, empty, duplicate or invalid bucket names. `pikku all` writes `.pikku/backends/<name>/content-buckets.gen.ts` exporting `ContentBucket`, so `ContentService<ContentBucket>` rejects an unlisted bucket at compile time. `pikku serve` takes `--backend <name>`. Breaking change: see docs/MIGRATION.md.
