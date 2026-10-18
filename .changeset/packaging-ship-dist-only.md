---
'create-pikku': patch
'pikku': patch
'@pikku/addon-admin': patch
'@pikku/addon-console': patch
'@pikku/addon-graph': patch
'@pikku/ai-deepinfra': patch
'@pikku/ai-vercel': patch
'@pikku/ai-voice': patch
'@pikku/assistant-ui': patch
'@pikku/aws-services': patch
'@pikku/azure-functions': patch
'@pikku/backblaze': patch
'@pikku/browser': patch
'@pikku/bun-server': patch
'@pikku/cli': patch
'@pikku/cloudflare': patch
'@pikku/code-edit': patch
'@pikku/deploy': patch
'@pikku/deploy-azure': patch
'@pikku/deploy-cloudflare': patch
'@pikku/deploy-serverless': patch
'@pikku/deploy-standalone': patch
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
'@pikku/kysely-bun-sqlite': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-node-sqlite': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-sqlite': patch
'@pikku/lambda': patch
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
---

Every publishable package now ships only what it needs,, as `@pikku/core` does:

- A `files` allow-list: `dist` (and `@pikku/aws-services`' `scripts`), plus the `README.md`, `LICENSE` and `package.json` npm always includes. Tarballs no longer carry `knowledge/`, `run-tests.sh`, test fixtures, stray `src/` files, the CHANGELOG or `tsconfig.tsbuildinfo`.
- `build` deletes `dist/` and `tsconfig.tsbuildinfo` first (`bun run clean`), so a local publish can no longer ship modules whose sources were deleted.
- `./package.json` is exported, so `import pkg from '@pikku/<name>/package.json'` resolves under an `exports` map.
