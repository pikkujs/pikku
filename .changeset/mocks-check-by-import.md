---
'@pikku/cli': patch
---

`pikku mocks check`, `pikku mocks diff` and the mocks part of `pikku validate` now find hook calls anywhere in the repo, not only in `apps/*/src`. They scan every file git tracks or does not ignore, submodules included, so `node_modules`, `dist`, `.pikku` and ignored copies are left out. `--src` still limits the scan to the directories given, and a project outside git falls back to `apps/*/src`.

A hook call counts only when its import resolves to this project's React Query client (`clientFiles.reactQueryFile`). Relative paths, tsconfig path aliases and package exports resolve the way TypeScript resolves them, and re-exports are followed. Hooks imported from another project's client are skipped, as is an import that only renames another export to a hook name, such as `usePikkuCloudQuery as usePikkuQuery`. An import that cannot be resolved is still checked.
