---
'@pikku/cli': patch
---

fix(persona): give `persona run` a singleton agent runner, so `talkTo` works

`pikku persona run` built a dev agent runner and handed it to the virtual-user
engine as `llm`, which covers the persona's own thinking and nothing else. The
`talkTo` tool does not go through that handle: `HttpPersona.converse` asks
`getSingletonServices()` for an `agentRunner`, and the CLI had never put one
there. So a persona whose scopes reached one of the app's agents threw
`AIProviderNotConfiguredError` on its first turn and took the whole run with
it, while the same project ran fine as a persona holding no agent scopes —
which reads as the app being broken for its privileged users rather than as a
missing wire in the runner.

The runner is now registered on the singleton services before the run starts.
Nothing else about the run changes; a project with no agents behaves exactly as
it did.
