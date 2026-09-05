---
'@pikku/cli': patch
---

`pikku dev` and `pikku serve` build an agent runner for one-shot AI calls, and it can do audio.

The runner used to be constructed only when the project declared an agent, so a function destructuring `agentRunner` for a single vision, transcription or speech call got `undefined` locally and threw. It is now also built when `agentRunner` is in the project's required services.

`@ai-sdk/openai-compatible` exposes only language, embedding and image models, so `transcription`/`speech` are delegated to `@ai-sdk/openai` pointed at the same base URL — its `/v1/audio/*` shape is what gateways implement. Nothing else is delegated, and when that package cannot be resolved audio stays unavailable and everything else still works.
