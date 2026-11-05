---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

`wireRemoteAddon` no longer accepts `uses`. A remote server never calls another addon, so the field had no consumer; screens and contributors for a remote name come from `local`.
