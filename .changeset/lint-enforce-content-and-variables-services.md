---
'@pikku/cli': patch
---

Two lint keys, on by default at `error`: `lint.enforceContentService` makes `pikku validate` require the app's oxlint to forbid `fs` / `node:fs` / `fs/promises` imports (`no-restricted-imports`) and `require` (`typescript/no-require-imports`), and `lint.enforceVariablesService` makes it require `node/no-process-env`. A missing rule is reported as `oxlint-enforce-content-service` or `oxlint-enforce-variables-service`, each use as its oxlint finding, and `pikku enable oxlint` writes the rules with `*.test.*` and `*.spec.*` files exempted. Breaking for any project that reads files or the environment directly: use the `content`, `variables` and `secrets` services, exempt a file in an oxlint `overrides` entry, or set the key to `'warn'` or `'off'` in `pikku.config.json`. See `docs/MIGRATION.md`.

`pikku serve`, `pikku dev` and the `pikku db` commands now pass the `variables` service to the project's `createConfig`, as every deploy host already does, so a config can read its values without `process.env`. The starter template, `field-service` and `online-shop` do so; `online-shop` sets `enforceContentService` to `'off'` because its scenario steps write screenshots with `node:fs`.
