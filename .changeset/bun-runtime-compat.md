---
'@pikku/cli': patch
---

Make the CLI work when it runs on bun, not just node.

Projects invoke it as `bunx --bun pikku …` so it inherits bun's `node:sqlite`
(node only ships that unflagged from 24). Under `--bun` the process is bun, where
`process.loadEnvFile` does not exist — so `.env` silently failed to load with
`Could not read .env: process.loadEnvFile is not a function`, and every secret in
it was lost. Parse the file directly when that method is missing.

Also turn the bare `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module:
node:sqlite` into a message that names the cause (Node too old) and the two ways
out (upgrade Node, or run on bun).
