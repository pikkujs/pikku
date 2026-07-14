---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

feat(ai-agent): agents can reference workflows as tools

`pikkuAIAgent` gains a `workflows: []` capability alongside `tools` and `agents`. A referenced workflow is exposed to the LLM as a tool whose input schema is the workflow's own input; when called it runs the workflow inline (`runToCompletion`) and returns its output. This makes a workflow a first-class agent capability (functions / agents / workflows), fixing the previously-broken pattern of putting a workflow `ref()` in `tools` — workflow graphs are not RPC-registered, so they never resolved there.
