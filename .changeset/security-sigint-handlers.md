---
"@pikku/express-server": patch
"@pikku/fastify-server": patch
"@pikku/uws-server": patch
---

Stop calling removeAllListeners('SIGINT') which destructively removes third-party signal handlers.
