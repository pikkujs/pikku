---
'@pikku/kysely-postgres': patch
---

feat(kysely-postgres): `PikkuKysely` accepts `PostgresConfig` pool options

New optional 4th constructor arg maps the core `PostgresConfig` onto postgres.js
options (`max`, `connect_timeout`, `idle_timeout`, `max_lifetime`, `prepare`,
`connection.statement_timeout`). Only provided keys are set, so postgres.js
defaults are otherwise preserved. Backward-compatible.
