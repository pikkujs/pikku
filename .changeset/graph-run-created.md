---
'@pikku/core': patch
---

`startWorkflow` calls `onRunCreated` for a graph workflow too, before its first node runs. Only DSL workflows reported their run id.
