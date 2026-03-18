---
"@pikku/core": patch
---

Support sub-workflow invocation in graph-based workflow steps. When a step's rpcName refers to a registered workflow instead of an RPC function, `executeGraphStep` now starts it as a child workflow and polls for completion. Respects the `inline` meta flag on the sub-workflow.
