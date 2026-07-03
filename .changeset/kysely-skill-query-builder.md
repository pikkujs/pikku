---
'@pikku/cli': patch
---

pikku-kysely skill: add a dense query-builder section (joins, aggregates + groupBy/having, insert/update/delete RETURNING, sql template, expression builder, $if, transactions, jsonArrayFrom/jsonObjectFrom relation helpers) and widen the trigger so the skill fires when writing a non-trivial query in a function body, not only when wiring database services. The skill previously covered only service setup, leaving agents to guess the query API.
