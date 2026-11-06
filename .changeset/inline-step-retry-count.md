---
'@pikku/core': patch
---

An inline workflow step now gets `retries + 1` attempts, as a queued step does: `retries: 1` retries once, where it used to run once and stop. This covers inline runs, compensation steps run inline, and a function step (`workflow.do('Name', fn, options)`) in a queued run. `retries: 0` still means one attempt, and no default changes, so a step that declares no retries gets one more attempt than before. See `docs/MIGRATION.md`.
