---
'@pikku/cli': patch
---

Add `pikku fabric publish [dir]` and `pikku fabric add <id>` for the Fabric community registry. `publish` packs a package directory into an artifact and uploads it via a short-lived presigned URL (authenticated; attributed to the publisher's org or person). `add` resolves a public presigned download and copies the package source shadcn-style into `addons.addonDir` (new `pikku.config.json` config, default `src/addons`).
