---
'@pikku/core': patch
---

fix(virtual-user): offer agents under the name the server can resolve

`reachableAgents` named each offered agent `agent.name ?? id`, where `id` is the
key the agent is registered under and `agent.name` is the display label from its
config. Those are the same string only by coincidence. `addAgent` stores the
export's own name and `resolveAgent` looks the call up by it, so an agent
exported as `adminAgent` and declaring `name: 'admin-agent'` was advertised to a
virtual user as `admin-agent` — a name nothing has ever registered. The persona
took the offer on its first turn, the stage answered
`500 AI agent not found: admin-agent`, and the run died there. Every fixture in
the tests happened to use one string for both, so nothing caught it.

The offered name is now always the registration key. `AgentReachability.name` is
gone rather than ignored, so there is no longer a display label sitting in the
shape inviting the same mistake.
