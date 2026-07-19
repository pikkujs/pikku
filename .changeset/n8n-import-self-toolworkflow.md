---
'@pikku/n8n-import': patch
---

Lift a self-referencing n8n `toolWorkflow` into its own `pikkuWorkflowGraph` referenced via `workflows: [ref(...)]`, instead of a broken `tools: [ref(<graph>)]`.
