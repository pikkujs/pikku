---
'@pikku/templates-cli': patch
'@pikku/templates-mcp-server': patch
'@pikku/templates-tanstack': patch
'@pikku/templates-workflows-bullmq': patch
'@pikku/templates-workflows-pg-boss': patch
---

Point `#pikku/*` at the `.pikku` beside each recipe's `pikku.config.json` (the generated output), not at `../functions/.pikku`, so `pikku validate` no longer reports `layout-pikku-import-not-root`.
