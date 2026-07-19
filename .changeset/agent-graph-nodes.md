---
'@pikku/core': patch
'@pikku/cli': patch
---

A workflow-graph node's `func` can now reference a registered AI agent by name, dispatched as an agent run like sub-workflows, with `ref()` resolving the agent's output keys.
