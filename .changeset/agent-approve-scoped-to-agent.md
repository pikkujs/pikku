---
'@pikku/core': patch
'@pikku/cli': patch
---

`agentApprove(agentName)` now only approves runs of the agent it was built for. It used to ignore its argument, so a route such as `wireHTTP({ route: '/agents/ops/approve', func: agentApprove('opsAgent') })` accepted approvals for any agent run the caller owned. A run that belongs to a different agent is now refused with a `ForbiddenError` (403): `Run <runId> belongs to agent '<actual>', not '<expected>'`. The ownership check still runs first.

The same mismatch in `rpc.agent.approve(runId, approvals, expectedAgentName)` and `approveAgent(...)` now throws `ForbiddenError` (403). It used to throw a plain `Error`, which reached HTTP clients as a 500.
