---
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/deploy': patch
---

Register an agent invoked from a function body in the calling deployment unit.

`runAgent('houseAssistant', ...)` and `rpc.agent.run('houseAssistant', ...)` resolve against the in-process agent registry, but the deploy analyzer only ever put an agent's registration in its own `agent-*` unit. A function calling one landed in a separate unit whose bootstrap never registered it, so the deployed worker threw `AI agent not found: houseAssistant`.

The inspector now records a string-literal agent name passed to `runAgent` / `streamAgent` / `rpc.agent.run` / `rpc.agent.stream` in a function body under `agents.invokedAgentsByFile`, mirroring what it already does for `rpc.invoke` targets. The analyzer carries those names on the calling unit as `invokedAgents` and adds the `ai-model` / `ai-storage` service requirements, and per-unit codegen puts the agent — and its tools — into that unit's filter names so its wiring is generated there too. A dynamic (template-literal) agent name is warned about, as it is for `rpc.invoke`.
