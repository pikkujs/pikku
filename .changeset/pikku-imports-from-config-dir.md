---
'@pikku/cli': patch
---

`pikku validate` reads `#pikku/*` from the tsconfig that governs a functions package (its own or the nearest one above it), so a project with `pikku.config.json` at the root and code in `packages/functions` maps `#pikku/*` with root tsconfig `paths` and needs no `packages/functions/.pikku` symlink. `layout-pikku-import-not-root` now flags a package-level `.pikku` mapping, and the Cloud `functions-pkg-missing-pikku-import` checks accept tsconfig `paths`. See docs/MIGRATION.md.
