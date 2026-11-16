---
'@pikku/cli': patch
'@pikku/kysely': patch
'@pikku/skills': patch
---

Review follow-ups for the plain table declaration: `compileTables` no longer emits `declareOnly` tables, the type check no longer lets `timestamp[]` pass as `timestamp` or `interval` as an integer, a non-boolean `declareOnly` is refused, `pikku db generate` writes nothing when `db/annotations.ts` still exists, and the MIGRATION guide and build skill snippets are corrected.
