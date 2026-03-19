---
"@pikku/inspector": patch
---

Cache Zod schema generation between re-inspection passes. If function meta hasn't changed, reuse previously generated Zod schemas instead of re-evaluating every schema via tsx/esm/api. Reduces `pikku all` from ~3 minutes to ~25 seconds on projects with many Zod schemas.
