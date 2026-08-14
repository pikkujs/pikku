---
'@pikku/addon-console': patch
'@pikku/addon-graph': patch
'@pikku/ai-vercel': patch
'@pikku/aws-services': patch
'@pikku/azure-functions': patch
'@pikku/better-auth': patch
'@pikku/bun-server': patch
'@pikku/cli': patch
'@pikku/cloudflare': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-standalone': patch
'@pikku/express-middleware': patch
'@pikku/express': patch
'@pikku/fastify-plugin': patch
'@pikku/fastify': patch
'@pikku/gateway-slack': patch
'@pikku/inspector': patch
'@pikku/jose': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
'@pikku/kysely': patch
'@pikku/lambda': patch
'@pikku/modelcontextprotocol': patch
'@pikku/mongodb': patch
'@pikku/n8n-import': patch
'@pikku/next': patch
'@pikku/node-http-server': patch
'@pikku/playwright': patch
'@pikku/queue-bullmq': patch
'@pikku/queue-pg-boss': patch
'@pikku/redis': patch
'@pikku/schedule': patch
'@pikku/uws-handler': patch
'@pikku/uws': patch
'@pikku/ws': patch
---

Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.
