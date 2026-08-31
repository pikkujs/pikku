---
'@pikku/core': patch
---

Drive a persona's agent turn over the SSE route. The plain `POST /rpc/agent/:name` buffers the entire run before sending a byte, so any run longer than undici's 300s headers timeout failed with `UND_ERR_HEADERS_TIMEOUT` — which is most conversational agents.
