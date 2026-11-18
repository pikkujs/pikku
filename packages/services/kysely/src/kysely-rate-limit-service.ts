import { sql } from 'kysely'
import type { Kysely } from 'kysely'
import {
  assertRateLimitArgs,
  type RateLimitResult,
  type RateLimitService,
} from '@pikku/core/services'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { appNowMs } from './kysely-lease-clock.js'
import { requirePikkuSchema } from './schema/index.js'
import { insertOrIgnore, isMysql } from './kysely-upsert.js'
import { rateLimitSchema } from './schema/rate-limit.schema.js'

/** How often a service sweeps out windows that have ended. */
const PRUNE_EVERY_MS = 60_000

/**
 * Rate limits on the `pikku_rate_limit` table, one row per key.
 *
 * Use it directly on SQLite. On PostgreSQL and MySQL use
 * `PgKyselyRateLimitService` and `MySQLKyselyRateLimitService`, which judge
 * every window on the database's clock rather than on each worker's own.
 *
 * A hit is one guarded `UPDATE`: it changes the row exactly when the window has
 * ended or has room left, so one row changed means admitted and none means
 * refused — on MySQL too, because an admitted hit always changes the row.
 */
export class KyselyRateLimitService implements RateLimitService {
  private initialized = false
  private lastPrune = 0

  constructor(protected db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, rateLimitSchema)
    this.initialized = true
  }

  /** Now, in epoch milliseconds, on the clock windows are judged by. */
  protected nowMs() {
    return appNowMs(isMysql(this.db))
  }

  async hit(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    assertRateLimitArgs(limit, windowMs)
    await insertOrIgnore(
      this.db,
      this.db
        .insertInto('pikkuRateLimit')
        .values({ key, count: 0, resetAt: 0 }),
      ['key']
    ).execute()

    const now = this.nowMs()
    // `count` is assigned first: MySQL evaluates `SET` left to right against the
    // values already assigned, and its test must see the previous `resetAt`.
    const update = await this.db
      .updateTable('pikkuRateLimit')
      .set((eb) => ({
        count: eb
          .case()
          .when('resetAt', '<=', now)
          .then(1)
          .else(eb('count', '+', 1))
          .end(),
        resetAt: eb
          .case()
          .when('resetAt', '<=', now)
          .then(sql<number>`${now} + ${windowMs}`)
          .else(eb.ref('resetAt'))
          .end(),
      }))
      .where('key', '=', key)
      .where((eb) => eb.or([eb('resetAt', '<=', now), eb('count', '<', limit)]))
      .executeTakeFirst()
    const allowed = Number(update.numUpdatedRows) === 1

    const row = await this.db
      .selectFrom('pikkuRateLimit')
      .select(['count', 'resetAt'])
      .where('key', '=', key)
      .executeTakeFirstOrThrow()
    const resetAt = Number(row.resetAt)
    await this.pruneIfDue()

    return {
      allowed,
      count: Number(row.count),
      limit,
      resetAt: new Date(resetAt),
      retryAfterMs: Math.min(windowMs, Math.max(0, resetAt - Date.now())),
    }
  }

  /** Deletes windows that have ended. A hit calls it at most once a minute. */
  async prune(): Promise<void> {
    await this.db
      .deleteFrom('pikkuRateLimit')
      .where('resetAt', '<=', this.nowMs())
      .execute()
  }

  private async pruneIfDue(): Promise<void> {
    const at = Date.now()
    if (at - this.lastPrune < PRUNE_EVERY_MS) return
    this.lastPrune = at
    await this.prune()
  }
}
