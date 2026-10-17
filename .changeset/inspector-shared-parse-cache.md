---
'@pikku/inspector': patch
---

Schema generation reuses the source files the inspector already parsed instead of parsing the project a second time. `pikku all` on examples/online-shop: 4.4s → 3.4s, peak RSS 1.41GB → 1.03GB, output unchanged.
