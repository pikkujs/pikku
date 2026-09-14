---
'@pikku/core': patch
---

Keep the agent runtime out of deployment units that hold no agent.

`ContextAwareRPCService.agent` imported `agent-rpc.ts` directly, and every unit
reaches that class through the function runner, so the agent runner, stream,
memory and AGUI modules were pinned into every bundle — 51.8 KB raw / 15.7 KB
gzip a unit. The facade is now resolved through state, registered by
`@pikku/core/agent` on import, so only a unit that actually holds an agent
bundles it. A unit that reaches `rpc.agent` without importing the agent entry
point throws rather than silently pulling the runtime back in.
