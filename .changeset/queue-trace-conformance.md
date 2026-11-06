---
'@pikku/core': patch
---

Add `defineQueueTraceConformance` to `@pikku/core/testing`: runs a queue adapter's failures, retries, delays and mixed job formats through a real broker and checks each keeps its trace.
