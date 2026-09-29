---
'@pikku/kysely': patch
---

`@pikku/kysely` re-exports `Kysely`, `PostgresDialect` and `CamelCasePlugin` from its own copy of kysely. The local-services codegen writes these imports into a project, so it now opens and types the database with the same kysely copy the generated services were built against, instead of a second copy the project may resolve on its own.
