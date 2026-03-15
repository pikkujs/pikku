---
"@pikku/core": patch
---

Fix SSE error handler to send `[DONE]` as JSON (`{"type":"done"}`) for consistency with all other SSE messages.
