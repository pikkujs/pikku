---
"@pikku/cli": patch
"@pikku/cloudflare": patch
"pikku-vscode": patch
"@pikku/kysely-mysql": patch
---

Replace workspace:* protocol with explicit npm version ranges in all package.json files. Fixes broken publishes where workspace:* was included literally in the npm registry.
