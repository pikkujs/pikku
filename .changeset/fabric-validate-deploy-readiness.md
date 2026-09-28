---
'@pikku/cli': patch
---

`pikku fabric validate` reports failures that only show up on a deploy build host

- A project that still has `fabric.config.json` under its old name and no `pikkufabric.config.json` is an error, because the build container only reads the new name.
- An `overrides`/`resolutions` pin that holds an `@pikku/*` package at a different version from the one the project declares is an error.
- A `bun.lock` that resolves `ai`, `@ai-sdk/provider(-utils)`, `zod` or `@pikku/core` at more than one major version is a warning. A hoist can give a workspace member the wrong copy.
- An app whose vite config sets paraglide's `outputStructure`/`strategy`/`outdir` but has no `i18n:compile` script is flagged. The deploy compiles translations with the CLI's defaults.
