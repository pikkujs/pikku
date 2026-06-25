---
'@pikku/cli': patch
---

fix(cli): auto-construct the AI agent runner in `pikku dev`

Deployed agent units get their `aiAgentRunner` wired by the bundler, but the dev
server had no equivalent — so agents run against `pikku dev` (e.g. in a fabric
sandbox) threw `AIProviderNotConfiguredError` and surfaced as a 503. The dev
command now builds a `VercelAIAgentRunner` from env when an OpenAI-compatible
base URL + key are present (`OPENAI_BASE_URL`/`OPENAI_API_KEY`, falling back to
`LITELLM_PROXY_URL`/`LITELLM_API_KEY`) and injects it into the singleton
services. `@pikku/ai-vercel` + `@ai-sdk/openai-compatible` are resolved from the
project's `node_modules` (so they share the project's `ai` version) and loaded
dynamically; when the env or packages are absent the runner is simply omitted
and the clear downstream error is preserved.
