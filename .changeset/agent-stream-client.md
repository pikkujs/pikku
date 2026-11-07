---
'@pikku/fetch': patch
'@pikku/cli': patch
'@pikku/react': patch
'@pikku/skills': patch
---

Fix the generated client's `agent.stream`, which parsed the event stream as JSON and resolved `undefined` once the run ended. It is now an async iterable of the run's AG-UI events, read by `CorePikkuFetch.agentStream`, and a `RUN_ERROR` throws a `PikkuAgentStreamError` instead of vanishing. `subscribeToSSE` shares the same frame reader (`readServerEvents`). `agent.run` and `agent.approve` are typed per agent and resolve to `status: 'suspended'` with `pendingApprovals` when a tool needs approval. `usePikkuAgent` passes all three through, typed; the generated React Query file registers the app's agents, so an unknown agent name is a type error. Breaking: `usePikkuAgent` no longer takes an `RPC` type argument — see docs/MIGRATION.md.
