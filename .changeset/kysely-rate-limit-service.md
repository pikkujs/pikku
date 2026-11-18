---
'@pikku/kysely': patch
'@pikku/kysely-postgres': patch
'@pikku/kysely-mysql': patch
---

Add `KyselyRateLimitService`, a `RateLimitService` on a new `pikku_rate_limit` table (the `rate-limit` schema, brought in by `rateLimitService`). Each hit is one guarded `UPDATE`, so concurrent hits never admit more than the limit, and counts survive restarts. `PgKyselyRateLimitService` and `MySQLKyselyRateLimitService` judge every window on the database's clock. Expired windows are pruned by a hit at most once a minute.
