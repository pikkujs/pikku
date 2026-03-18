---
"@pikku/express": patch
"@pikku/fastify": patch
"@pikku/uws": patch
---

Stop calling removeAllListeners('SIGINT') which destructively removes third-party signal handlers.
