---
"@pikku/core": patch
"@pikku/ai-vercel": patch
---

Add per-request API key override to AI agent runner

`VercelAIAgentRunner` gains an optional `providerFactory` constructor param and a `withApiKey(apiKey)` method that forks a new runner scoped to a given key without touching the global singleton.

`RunAIAgentParams` gains an optional `getCredential` accessor so callers can thread per-request credentials (e.g. a user's `AI_API_KEY` from the credential wire service) into `prepareAgentRun`. If a credential is found and the runner supports `withApiKey`, the runner is forked before the agent executes.

`AIAgentRunnerService` interface gains the optional `withApiKey?` method.
