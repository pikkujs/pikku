---
'@pikku/inspector': patch
---

Keep a numeric `retryDelay` numeric through the graph round-trip. The serialized
graph typed it as `string` and the DSL→graph conversion called `.toString()`, so
`retryDelay: 500` regenerated as `retryDelay: '500'` — a different value to the
runtime, which parses strings as durations.
