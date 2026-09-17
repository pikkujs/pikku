---
'@pikku/inspector': patch
---

An AI agent's `providerOptions` now reaches the generated metadata.

The inspector read `model`, `temperature`, `maxSteps` and `toolChoice` off an agent declaration but never `providerOptions`, so `agentsMeta` always showed an agent with no provider configuration — even though the type says it carries one. Runs were unaffected, since the runner takes the value from the live agent object, which is exactly why the gap went unnoticed by everything except what reads the compiled meta: the console's agent view and `infra.json`.

The value is read as an object literal of strings, numbers, booleans, arrays and nested objects, all-or-nothing. A computed one is reported as `PKU156` rather than silently dropped.
