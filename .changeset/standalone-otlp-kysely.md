---
'@pikku/kysely': patch
---

The trace dialect picks up the active trace through the runtime's `currentTrace()`, so a query span is a child of the function span.
