---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/fetch': patch
'@pikku/websocket': patch
'@pikku/openapi-to-zod-schema': patch
'pikku': patch
'@pikku/schedule': patch
'@pikku/lambda': patch
'@pikku/azure-functions': patch
'@pikku/cloudflare': patch
'@pikku/express-middleware': patch
'@pikku/express': patch
'@pikku/fastify-plugin': patch
'@pikku/fastify': patch
'@pikku/modelcontextprotocol': patch
'@pikku/next': patch
'@pikku/node-http-server': patch
'@pikku/tanstack-start': patch
'@pikku/uws-handler': patch
'@pikku/uws': patch
'@pikku/ws': patch
'@pikku/aws-services': patch
'@pikku/browser': patch
'@pikku/schema-ajv': patch
'@pikku/schema-cfworker': patch
---

Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.
