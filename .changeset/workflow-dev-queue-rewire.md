---
'@pikku/core': patch
'@pikku/cli': patch
---

Rewire workflow queue workers after bootstrap in `pikku dev` so in-memory workflow queues added after service construction can run pending workflow steps.
