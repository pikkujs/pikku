---
'@pikku/cli': patch
---

`pikku fabric link` now returns and logs the linked project's id (`projectId=<uuid>`) alongside its slug. Previously only the slug was emitted, forcing callers (and the e2e harness) to do a follow-up lookup to resolve the project id before operating on it (e.g. requesting a sandbox).
