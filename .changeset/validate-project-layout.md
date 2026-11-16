---
'@pikku/cli': patch
---

`pikku validate` checks the project layout of every app project: `pikku.config.json` at the top level and only one of it, `db/` and `emails/` beside it rather than inside a `srcDirectories` package, and `#pikku/*` resolving to `<config dir>/.pikku`. Findings (`layout-config-not-at-root`, `layout-config-duplicate`, `layout-db-in-package`, `layout-emails-in-package`, `layout-pikku-import-not-root`) are warnings, and errors under `--strict`. See docs/MIGRATION.md.
