---
'@pikku/cli': patch
'@pikku/core': patch
---

Add `db.engine` and `db.pgVersion` to the CLI config types, and make local env-backed secrets fall back to raw strings when JSON parsing fails.
