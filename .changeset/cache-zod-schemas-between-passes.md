---
"@pikku/inspector": patch
---

Cache Zod schema generation between re-inspection passes and batch imports by source file. Schemas are cached using a fingerprint of schemaLookup entries + file mtimes, so reinspections skip Zod generation entirely when schemas haven't changed. Source file imports are grouped so each file is imported once instead of per-schema. Reduces `pikku all` from ~5 minutes to ~13 seconds on projects with many Zod schemas.
