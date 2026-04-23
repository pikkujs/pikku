---
'@pikku/inspector': patch
---

Log a critical inspector error when multiple functions resolve to the same `pikku` function name, instead of silently allowing routing map collisions. This may cause builds to fail if multiple functions previously resolved to the same `pikku` function name.
