import { PikkuLockService, type LockLease } from '@pikku/core/services'
import type { Kysely, Selectable } from 'kysely'
import type { KyselyPikkuDB, PikkuLockTable } from './kysely-tables.js'
import { appNowMs, leaseUntil } from './kysely-lease-clock.js'
import { requirePikkuSchema } from './schema/index.js'
import { lockSchema } from './schema/lock.schema.js'

const toLease = (row: Selectable<PikkuLockTable>): LockLease => ({
  key: row.key,
  holder: row.holder,
  token: Number(row.token),
  expiresAt: new Date(Number(row.expiresAt)),
})

/**
 * Lease locks on the `pikku_lock` table.
 *
 * Use it directly on SQLite. On PostgreSQL and MySQL use
 * `PgKyselyLockService` and `MySQLKyselyLockService`, which judge every lease
 * on the database's clock rather than on each worker's own.
 *
 * Every statement is one MySQL can run too — no `RETURNING`, no conditional
 * upsert — so the dialects differ only in `nowMs` and `insertIfAbsent`.
 */
export class KyselyLockService extends PikkuLockService {
  private initialized = false

  constructor(protected db: Kysely<KyselyPikkuDB>) {
    super()
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, lockSchema)
    this.initialized = true
  }

  /** Now, in epoch milliseconds, on the clock leases are judged by. */
  protected nowMs() {
    return appNowMs()
  }

  /** Create the key's row, lapsed, unless it already has one. */
  protected async insertIfAbsent(key: string, holder: string): Promise<void> {
    await this.db
      .insertInto('pikkuLock')
      .values({ key, holder, token: 0, expiresAt: 0 })
      .onConflict((oc) => oc.column('key').doNothing())
      .execute()
  }

  /**
   * The row is created lapsed and then taken by the same guarded `UPDATE` as
   * any other lapsed lease, so there is one path to holding a key. `token` is
   * assigned first: MySQL evaluates `SET` left to right against the values
   * already assigned, and the holder test must see the previous holder.
   *
   * Whether the update won is read back rather than taken from its row count,
   * because MySQL counts rows changed, not rows matched.
   */
  async acquire(key: string, holder: string, ttlMs: number) {
    await this.insertIfAbsent(key, holder)
    const now = this.nowMs()
    await this.db
      .updateTable('pikkuLock')
      .set((eb) => ({
        token: eb
          .case()
          .when(eb.and([eb('holder', '=', holder), eb('expiresAt', '>', now)]))
          .then(eb.ref('token'))
          .else(eb('token', '+', 1))
          .end(),
        holder,
        expiresAt: leaseUntil(now, ttlMs),
      }))
      .where('key', '=', key)
      .where((eb) =>
        eb.or([eb('holder', '=', holder), eb('expiresAt', '<=', now)])
      )
      .execute()
    return this.readHeld(key, holder)
  }

  async refresh(lease: LockLease, ttlMs: number) {
    const now = this.nowMs()
    await this.db
      .updateTable('pikkuLock')
      .set({ expiresAt: leaseUntil(now, ttlMs) })
      .where('key', '=', lease.key)
      .where('holder', '=', lease.holder)
      .where('token', '=', lease.token)
      .where('expiresAt', '>', now)
      .execute()
    return this.readHeld(lease.key, lease.holder, lease.token)
  }

  async release(lease: LockLease) {
    await this.db
      .updateTable('pikkuLock')
      .set({ expiresAt: 0 })
      .where('key', '=', lease.key)
      .where('holder', '=', lease.holder)
      .where('token', '=', lease.token)
      .execute()
  }

  async get(key: string) {
    const row = await this.db
      .selectFrom('pikkuLock')
      .selectAll()
      .where('key', '=', key)
      .where('expiresAt', '>', this.nowMs())
      .executeTakeFirst()
    return row ? toLease(row) : null
  }

  private async readHeld(key: string, holder: string, token?: number) {
    let query = this.db
      .selectFrom('pikkuLock')
      .selectAll()
      .where('key', '=', key)
      .where('holder', '=', holder)
      .where('expiresAt', '>', this.nowMs())
    if (token !== undefined) {
      query = query.where('token', '=', token)
    }
    const row = await query.executeTakeFirst()
    return row ? toLease(row) : null
  }
}
