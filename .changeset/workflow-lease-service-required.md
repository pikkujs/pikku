---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
'@pikku/kysely-sqlite': patch
'@pikku/mongodb': patch
'@pikku/redis': patch
'@pikku/cloudflare': patch
'@pikku/skills': patch
---

Persistent workflow services take a required `leaseService` (`WorkflowServiceOptions`) and lock runs and steps on it. The Postgres advisory and MySQL `GET_LOCK` step locks, and Redis's own `SET NX` run and step locks, are removed; `RedisWorkflowService` now takes `(connection, { leaseService, keyPrefix? })`.
