---
"@pikku/core": patch
"@pikku/ai-vercel": patch
---

Forward pikkuAgent function name to LiteLLM as request metadata for per-agent usage breakdown.

Adds an optional `agentId` field to `AIAgentRunnerParams`. The wiring layer (`runAIAgent`, `streamAIAgent`, and the resume path) sets this to the agent's registered function name before invoking the runner. `VercelAIAgentRunner` injects it into `providerOptions` as `metadata.agent_id` so LiteLLM includes it in spend logs, enabling per-agent token and cost breakdowns.
