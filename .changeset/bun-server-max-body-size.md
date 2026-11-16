---
'@pikku/bun-server': patch
---

PikkuBunServer now applies the configured `maxBodySize` to request bodies instead of always using the 10 MiB default.
