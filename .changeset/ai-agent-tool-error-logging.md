---
'@pikku/core': patch
---

AI agent tool `execute()` failures are now logged through the structured logger (`logger.error`) unconditionally, even when no `aiMiddleware` `afterToolCall` hook is registered. Previously an exception thrown inside a tool's `execute()` was caught only at the AI SDK's tool-call boundary (surfacing as a generic conversational "tool error" reply) and never reached pikku's logging — making the actual failure undiagnosable server-side unless the app happened to register tool-call middleware. The error is still rethrown after logging, so runtime behavior is unchanged.
