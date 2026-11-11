---
'@pikku/cli': patch
---

`pikku dev` backend processes now exit when their parent is killed, and the `pikku all` lock no longer treats a zombie holder as running.
