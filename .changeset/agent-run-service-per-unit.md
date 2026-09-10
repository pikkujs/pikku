---
'@pikku/cli': patch
---

Only require `agentRunService` in deployment units that hold an agent

`scaffold.agent` is a project-wide config flag, so forcing `agentRunService`
into `requiredSingletonServices` whenever it was set marked the service required
in every unit — including units with no agent at all, whose sibling
`agentStorage` / `agentRunState` / `agentRunner` flags were correctly `false`.
The force now also requires the (filtered) inspector state to carry an agent.
