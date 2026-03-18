---
"@pikku/core": patch
---

Replace raw Error throws in AI agent runner/stream/prepare with typed PikkuError subclasses. `AIProviderNotConfiguredError` (503) replaces "AIAgentRunnerService not available" with a user-friendly message. `AIProviderAuthError` (401) available for API key validation errors.
