---
"@pikku/browser": patch
"@pikku/addon-console": patch
"@pikku/addon-graph": patch
"@pikku/ai-vercel": patch
"@pikku/ai-voice": patch
"@pikku/assistant-ui": patch
"@pikku/aws-services": patch
"@pikku/azure-functions": patch
"@pikku/backblaze": patch
"@pikku/better-auth": patch
"@pikku/bun-server": patch
"@pikku/cli": patch
"@pikku/cloudflare": patch
"@pikku/console": patch
"@pikku/core": patch
"@pikku/cucumber": patch
"@pikku/deploy-azure": patch
"@pikku/deploy-cloudflare": patch
"@pikku/deploy-serverless": patch
"@pikku/deploy-standalone": patch
"@pikku/express": patch
"@pikku/express-middleware": patch
"@pikku/fastify": patch
"@pikku/fastify-plugin": patch
"@pikku/fetch": patch
"@pikku/gateway-slack": patch
"@pikku/inspector": patch
"@pikku/jose": patch
"@pikku/kysely": patch
"@pikku/kysely-bun-sqlite": patch
"@pikku/kysely-mysql": patch
"@pikku/kysely-node-sqlite": patch
"@pikku/kysely-postgres": patch
"@pikku/kysely-sqlite": patch
"@pikku/lambda": patch
"@pikku/mantine": patch
"@pikku/modelcontextprotocol": patch
"@pikku/mongodb": patch
"@pikku/next": patch
"@pikku/node-http-server": patch
"@pikku/openapi-parser": patch
"@pikku/openapi-to-zod-schema": patch
"@pikku/paraglide": patch
"@pikku/pino": patch
"@pikku/queue-bullmq": patch
"@pikku/queue-pg-boss": patch
"@pikku/react": patch
"@pikku/redis": patch
"@pikku/schedule": patch
"@pikku/schema-ajv": patch
"@pikku/schema-cfworker": patch
"@pikku/tanstack-start": patch
"@pikku/uws": patch
"@pikku/uws-handler": patch
"@pikku/websocket": patch
"@pikku/ws": patch
"create-pikku": patch
---

Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.
