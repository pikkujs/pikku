---
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

Two new lint rules, on by default at `error`: `lint.enforceContentService` (`PKU412`) flags direct `fs` / `node:fs` / `fs/promises` use, and `lint.enforceVariablesService` (`PKU413`) flags direct `process.env` reads. Both are project-wide and skip generated code (`.pikku/`, `*.gen.ts`), declaration files and test files. Breaking for any project that reads files or the environment directly: use the `content`, `variables` and `secrets` services, or set the key to `'warn'` or `'off'` in `pikku.config.json`. Both inspector engines emit the diagnostics, and the serialized inspector state gains a `serviceBypass` section. See `docs/MIGRATION.md`.

`pikku serve`, `pikku dev` and the `pikku db` commands now pass the `variables` service to the project's `createConfig`, as every deploy host already does, so a config can read its values without `process.env`. The starter template, `field-service` and `online-shop` do so; `online-shop` sets `enforceContentService` to `'off'` because its scenario steps write screenshots with `node:fs`.
