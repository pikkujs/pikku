---
'@pikku/cli': patch
---

`pikku import n8n` now batch-imports. In addition to a single-workflow JSON
export, the `<file>` argument accepts:

- an **export array** (`n8n export:workflow --all`) — one scaffold per element;
- a `{ workflows: [...] }` wrapper — same;
- a **directory** of `.json` exports — each file is imported (non-`.json`
  entries are ignored).

Each workflow lands in its own slug-named sub-directory (no collisions), and a
per-workflow failure is reported and skipped rather than aborting the batch;
the command exits non-zero if any workflow failed. Single-file imports are
unchanged.
