---
'@pikku/schedule': patch
---

A delayed RPC in `InMemorySchedulerService` runs on the span its trace carried it to, so its parent is the span that scheduled it rather than one nothing reported.
