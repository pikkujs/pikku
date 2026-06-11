---
"@pikku/cli": patch
---

`pikku fabric validate` now errors when required Cloudflare deploy dependencies are missing from `packages/functions/dependencies` (not devDependencies):

- `@pikku/schema-cfworker` — always required; injected into every worker entry
- `@pikku/kysely` — always required; `secretContributor` imports `KyselySecretService` unconditionally
- `@pikku/ai-vercel` + `@ai-sdk/openai-compatible` — required when the project declares agent units (detected via `.pikku/agent/pikku-agent-wirings-meta.gen.json`)
