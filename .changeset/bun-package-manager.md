---
'@pikku/ai-deepinfra': patch
'@pikku/ai-vercel': patch
'@pikku/ai-voice': patch
'@pikku/assistant-ui': patch
'@pikku/aws-services': patch
'@pikku/azure-functions': patch
'@pikku/backblaze': patch
'@pikku/better-auth': patch
'@pikku/browser': patch
'@pikku/cli': patch
'@pikku/cloudflare': patch
'@pikku/code-edit': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/express': patch
'@pikku/express-middleware': patch
'@pikku/fastify': patch
'@pikku/fastify-plugin': patch
'@pikku/fetch': patch
'@pikku/gateway-slack': patch
'@pikku/inspector': patch
'@pikku/jose': patch
'@pikku/knowledge': patch
'@pikku/kysely': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
'@pikku/lambda': patch
'@pikku/mantine': patch
'@pikku/migrator-sql': patch
'@pikku/modelcontextprotocol': patch
'@pikku/mongodb': patch
'@pikku/n8n-import': patch
'@pikku/next': patch
'@pikku/node-http-server': patch
'@pikku/openapi-parser': patch
'@pikku/openapi-to-zod-schema': patch
'@pikku/paraglide': patch
'@pikku/pino': patch
'@pikku/playwright': patch
'@pikku/queue-bullmq': patch
'@pikku/queue-nats': patch
'@pikku/queue-pg-boss': patch
'@pikku/react': patch
'@pikku/redis': patch
'@pikku/schedule': patch
'@pikku/schema-ajv': patch
'@pikku/schema-cfworker': patch
'@pikku/skills': patch
'@pikku/tanstack-start': patch
'@pikku/uws': patch
'@pikku/uws-handler': patch
'@pikku/voice-agents': patch
'@pikku/websocket': patch
'@pikku/ws': patch
'create-pikku': patch
'pikku': patch
---

Run the monorepo's own scripts through bun instead of yarn. The published
behaviour is unchanged; what moves is the package manager each package's
`prepublishOnly` and build scripts invoke, plus the two manifest fixes bun
needs to resolve the tree: `uWebSockets.js` is declared with an explicit
`github:` specifier, and `@pikku/uws-handler` marks its `uWebSockets.js` peer
optional so a bun install of a consumer that brings its own uWS app does not
try to fetch it from the registry.
