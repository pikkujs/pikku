---
'@pikku/core': patch
---

The OTLP runtime telemetry exposes `currentTrace()` and `asContextStorage()`, so the runtime can hand the active trace to the database layer.
