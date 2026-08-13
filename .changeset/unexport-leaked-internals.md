---
'@pikku/ai-deepinfra': patch
'@pikku/ai-vercel': patch
'@pikku/assistant-ui': patch
'@pikku/better-auth': patch
'@pikku/bun-server': patch
'@pikku/core': patch
'@pikku/deploy-azure': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-serverless': patch
'@pikku/deploy-standalone': patch
'@pikku/express-middleware': patch
'@pikku/fastify-plugin': patch
'@pikku/fetch': patch
'@pikku/gateway-slack': patch
'@pikku/knowledge': patch
'@pikku/kysely': patch
'@pikku/kysely-bun-sqlite': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
'@pikku/lambda': patch
'@pikku/modelcontextprotocol': patch
'@pikku/mongodb': patch
'@pikku/n8n-import': patch
'@pikku/openapi-parser': patch
'@pikku/paraglide': patch
'@pikku/playwright': patch
'@pikku/redis': patch
'@pikku/voice-agents': patch
---

Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
