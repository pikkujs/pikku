---
'@pikku/core': patch
'@pikku/node-http-server': patch
'@pikku/bun-server': patch
'@pikku/fastify': patch
'@pikku/uws': patch
'@pikku/express': patch
---

Graceful shutdown ignores repeat signals. A second SIGTERM or SIGINT arriving while `beforeStop` and the service teardown are still running no longer falls through to the default handler and kills the process mid-cleanup. `@pikku/core/utils` gains `onShutdownSignals`, which the server runtimes now share.
