---
'create-pikku': patch
---

Remove `--stackblitz`. It scaffolded `pikku-gen` as the generated directory, but the CLI now always writes `.pikku` and has no `outDir` setting, so the option produced a project that could not resolve `#pikku`. Generated files go to `.pikku`; use a different sandbox.
