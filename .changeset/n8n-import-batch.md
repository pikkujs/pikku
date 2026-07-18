---
'@pikku/cli': patch
---

`pikku import n8n` now batch-imports export arrays, `{ workflows: [...] }` wrappers, and directories of `.json` exports — one slug-named sub-directory per workflow, per-workflow failures skipped.
