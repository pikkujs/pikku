---
"@pikku/core": patch
---

Prevent internal error details from leaking to clients. Stack traces via exposeErrors are now blocked in production. SSE and WebSocket error handlers use registered error responses instead of raw error messages. Secret key names and route paths are no longer included in error messages.
