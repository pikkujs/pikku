---
'@pikku/cli': patch
---

fabric validate: enforce minimum @pikku/* versions. `pikku fabric validate` now
scans every workspace manifest and errors when a gated @pikku package is below
the required floor (per-package, since the packages version independently). A
stale @pikku/cli ships a `pikku dev` that hangs without ever listening, and a
mismatched @pikku/core splits pikkuState into duplicate copies so app/console
routes 404 — both are hard blockers for a Fabric sandbox, so they fail validate
with a bump-and-reinstall fix hint.
