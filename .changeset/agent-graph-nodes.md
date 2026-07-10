---
'@pikku/core': patch
'@pikku/cli': patch
---

Allow a workflow-graph node's `func` to reference a registered AI agent by name, dispatched as an agent run — exactly like sub-workflows. `executeGraphStep`/`executeGraphNodeInline` now check the agent registry and dispatch matching nodes via the agent-run path (`rpc.agent.run`), so the node's result is the agent's declared output and downstream nodes can `ref()` it. The generated `pikkuWorkflowGraph` wrapper widens its node-func union to also accept `keyof FlattenedWorkflowMap` and `keyof FlattenedAgentMap`, and `ref()` resolves an agent node's output keys.
