---
'@pikku/inspector': patch
---

A `.transform()` in a schema used as a function's `input` now reports PKU491, naming the schema and the path to the transform, instead of surfacing downstream as PKU724 — the bad `#pikku/*` import error.
