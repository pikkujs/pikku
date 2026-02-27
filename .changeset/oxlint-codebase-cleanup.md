---
'@pikku/websocket': patch
'@pikku/schedule': patch
'@pikku/express': patch
'@pikku/fastify': patch
'@pikku/cloudflare': patch
'@pikku/azure-functions': patch
'@pikku/next': patch
'@pikku/uws': patch
'@pikku/ws': patch
'@pikku/modelcontextprotocol': patch
'@pikku/aws-services': patch
'@pikku/jose': patch
'@pikku/kysely': patch
'@pikku/pg': patch
'@pikku/pino': patch
'@pikku/queue-bullmq': patch
'@pikku/redis': patch
'@pikku/schema-ajv': patch
'@pikku/schema-cfworker': patch
---

Code quality improvements: resolve oxlint warnings and apply autofixes across the codebase (unused bindings, unnecessary constructors, prefer `const` over `let`, etc.). No behaviour changes.
