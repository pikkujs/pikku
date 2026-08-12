---
'@pikku/cli': patch
---

`rpc.agent.run` and `rpc.agent.stream` rejected every optional field of
`AIAgentInput`. The generated RPC map declared its own local copy of the
interface carrying only `message`, `threadId` and `resourceId`, so `model`,
`temperature`, `attachments` and `context` — all of which the runner reads and
acts on — were type errors at the call site with no way to pass them from typed
code. The map now imports `AIAgentInput` from `@pikku/core/ai-agent` instead of
restating it, which also stops the two definitions drifting again the next time
the input grows a field.
