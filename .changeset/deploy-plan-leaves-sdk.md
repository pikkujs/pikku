---
'@pikku/cli': patch
---

Per-unit deploy codegen no longer writes outside the unit's `outDir`, so `deploy plan` stops overwriting an RPC map or client file kept in a shared SDK, and frontends can build while it runs.
