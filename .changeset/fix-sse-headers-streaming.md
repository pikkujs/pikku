---
"@pikku/express-middleware": patch
"@pikku/fastify-plugin": patch
---

Fix SSE streaming headers not being sent before first chunk write, resolving ERR_INCOMPLETE_CHUNKED_ENCODING errors in approval flows
