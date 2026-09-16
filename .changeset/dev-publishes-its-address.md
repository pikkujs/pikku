---
'@pikku/cli': patch
---

`pikku dev` records the address it actually bound to, and `pikku scenario run` says so when a dev server is up somewhere other than the environment being targeted — a busy port previously surfaced only as a connection refused
