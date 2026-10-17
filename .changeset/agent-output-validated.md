---
'@pikku/core': patch
'@pikku/skills': patch
---

An agent's structured output is now validated (#1823).

**Breaking:** a `pikkuAgent` with an `output` schema fails its run with the new `AgentOutputValidationError` (502; `issues` lists what did not match) when the model's object does not match, instead of returning the malformed object. This applies to `rpc.agent.run`, `rpc.agent.approve` and sub-agent calls, and uses the app's `SchemaService`, like function input validation. The run is marked `failed` and `onError` agent middleware runs, as for any other agent failure; nothing is retried. A `null` the model sends for an optional field — which `@pikku/ai-vercel` invites by making optional properties nullable for OpenAI strict mode — is now dropped, so the field comes back absent rather than `null`.

A streamed run (`streamAgent`) is not validated: its answer reaches the client as it is generated, before there is a complete object to check. A direct `agentRunner.run` call has no agent, so no declared `output`, and is not validated either.
