---
'@pikku/core': patch
'@pikku/fetch': patch
'@pikku/aws-services': patch
'@pikku/backblaze': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku doc content` prints one whole upload from a compiled app, and a new `pikku-content` skill holds the rules around it. `content.getUploadURL` now returns `fileKey`, relative to the bucket, instead of `assetKey`. `uploadFile` on the fetch client takes and returns `fileKey`, resolves a relative `uploadUrl` against the server URL and uses the configured `fetch`. See `docs/MIGRATION.md`.
