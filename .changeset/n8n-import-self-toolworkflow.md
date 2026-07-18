---
'@pikku/n8n-import': patch
---

feat(n8n-import): lift a self-referencing `toolWorkflow` into its own graph

An n8n agent that exposes a workflow as a tool uses a `toolWorkflow` sub-node whose `workflowId` is `$workflow.id` — a self-reference whose body is a separate branch of the same file rooted at an `executeWorkflowTrigger`. That branch is now lifted into its own `pikkuWorkflowGraph` and the agent references it through `workflows: [ref(...)]`, instead of emitting a broken `tools: [ref(<graph>)]` (workflow graphs are not RPC-registered, so they never resolved as tools). The extracted body nodes and the trigger are dropped from the main graph.
