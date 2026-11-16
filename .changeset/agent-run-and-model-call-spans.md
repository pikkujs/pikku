---
'@pikku/core': patch
'@pikku/ai-vercel': patch
---

An agent run is now a span of its own, with its tool calls and each model call as children. The run carries `pikku.agent.name` and `pikku.agent.run_id`; a model call is a `chat` client span carrying `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons` and, when the runner read one, `pikku.ai.cost_usd`. Prompts, replies and tool arguments are never recorded. `AgentStepResult` gains an optional `cost`, which `@pikku/ai-vercel` reads from the `x-litellm-response-cost` response header.
