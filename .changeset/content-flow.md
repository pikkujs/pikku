---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

`pikku doc ContentService` now prints the service's methods, its real name on `services` (`content`), and the whole upload, save, read and agent attachment loop from `templates/online-shop`. Every interface read straight off a package had been printing no keys at all, which `collectSurface`'s new `ownMembers` option fixes for `email`, `eventhub`, `webhook` and the rest too.

`pikku dev` and `pikku serve` now honour the `content` block in `pikku.config.json`. It was never read, so `sizeLimit: '10mb'` in the starter and the online shop did nothing and uploads over 1mb were refused. A key set in `createConfig` still wins.

The content docs no longer claim bucket policies that nothing enforces. The `file-upload` example now passes `visibility` on the read, which closes a hole where a caller could claim `public` to skip the owner check and receive a signed URL to another user's private file.
