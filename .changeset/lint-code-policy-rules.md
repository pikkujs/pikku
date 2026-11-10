---
'@pikku/cli': patch
'create-pikku': patch
'@pikku/skills': patch
---

`pikku validate` requires two more code-policy rules in the app's oxlint, and `lint.enforceVariablesService` moves to a stricter rule. `lint.enforceSupervisor` (default `error`) forbids `child_process`, `execa`, `cross-spawn`, `shelljs` and `Bun.spawn` / `Bun.spawnSync` / `Bun.$`. `lint.enforceCliCommands` (default `error`) forbids `process.argv`, `Bun.argv`, `Deno.args`, `commander`, `yargs`, `minimist` and `parseArgs` from `node:util`. `lint.enforceContentService` also covers `fs-extra` and `graceful-fs`. `lint.enforceVariablesService` now requires `no-restricted-properties` on `process.env` instead of `node/no-process-env`, so `{ ...process.env }` and `const { env } = process` are reported; a config that only has the node rule fails with `oxlint-enforce-variables-service`. Run `pikku enable oxlint` to add the entries; it also writes an `overrides` entry that turns the rules off for `start.ts`, `server.ts`, `bin/`, `scripts/` and tests, and `create-pikku` writes the same config. One line is exempted with `// oxlint-disable-next-line <rule> -- reason`. See `docs/MIGRATION.md`.
