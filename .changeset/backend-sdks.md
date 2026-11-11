---
'@pikku/cli': patch
---

`pikku all` generates a client SDK per backend: `.pikku/sdk/<backend>/exposed/` (clients and typed contract from its `expose: true` functions) and `.pikku/sdk/<backend>/remote/` (a types-only contract from its `remote: true` functions, when it has any). The config paths for generated clients (`clientFiles.fetchFile`, `websocketFile`, `rpcWiringsFile`, `reactQueryFile`, `realtimeFile`, `queueWiringsFile`, `scopesFile`, `mcpJsonFile` and the `*MapDeclarationFile` keys) are removed; the loader names the new home. `backends.<name>.publish: true` packs the remote SDK, fail closed. Breaking changes are in docs/MIGRATION.md.
