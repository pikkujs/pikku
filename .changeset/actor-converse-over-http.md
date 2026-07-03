---
'@pikku/core': patch
'@pikku/inspector': patch
---

Add `actor.converse(...)` — actor agents for user journeys (#850)

An actor can now hold a dynamic, LLM-driven conversation with a target Pikku AI
agent in its own persona:

```ts
const verdict = await actors.pm.converse({
  agent: 'todoBot',
  task: 'Get a todo created for the launch',
  evaluate: 'A todo about the launch now exists',
})
// verdict: { passed, reasoning, transcript }
// then assert deterministically as the same actor:
const todos = await actors.pm.invoke('listTodos', {})
```

The actor drives the target over the real transport (the agent's own
`agentRun` / `agentApprove` HTTP routes, signed in as the actor), plays the
persona from its `pikku.config.json` config, answers the agent's tool-approval
requests in-persona (`approvals: 'in-persona' | 'always' | 'never'`), and
returns its verdict on whether the task was met. Deterministic checks stay the
caller's job — they already hold the actor.

The conversation engine is transport-agnostic (persona LLM + injected target
driver); the persona's own turns run in-process via the configured
`aiAgentRunner` (`model` from the call or the actors-service default).
