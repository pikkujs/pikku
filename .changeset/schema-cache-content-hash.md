---
'@pikku/inspector': patch
---

The TS schema cache compares a dependency by content when its mtime moved, so a checkout or restored CI cache no longer discards every schema.
