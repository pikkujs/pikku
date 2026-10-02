---
'@pikku/knowledge': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

`pikku knowledge validate` reports code that no note describes as a warning rather than info, and raises one `PKU960` diagnostic for it, so `--fail-on-warn` can gate on it and the "consistent" line no longer prints while notes are missing. A plain run still exits 0: only errors fail it.
