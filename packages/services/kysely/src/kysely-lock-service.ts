import type { LockLease, LockService } from '@pikku/core/services'
import type { Kysely, Selectable } from 'kysely'
import type { KyselyPikkuDB, PikkuLockTable } from './kysely-tables.js'
import { requirePikkuSchema } from './schema/index.js'
import { lockSchema } from './schema/lock.schema.js'

const toLease = (row: Selectable<PikkuLockTable>): LockLease => ({
  key: row.key,
  holder: row.holder,
  token: Number(row.token),
  expiresAt: new Date(row.expiresAt),
})

/** Each call is one conditional write, so the lock is exclusive on any dialect with upserts and holds no connection. */
export class KyselyLockService implements LockService {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, lockSchema)
    this.initialized = true
  }

  async acquire(key: string, holder: string, ttlMs: number) {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlMs)
    const row = await this.db
      .insertInto('pikkuLock')
      .values({ key, holder, token: 1, expiresAt })
      .onConflict((oc) =>
        oc
          .column('key')
          .doUpdateSet((eb) => ({
            holder,
            expiresAt,
            token: eb
              .case()
              .when(
                eb.and([
                  eb('pikkuLock.holder', '=', holder),
                  eb('pikkuLock.expiresAt', '>', now),
                ])
              )
              .then(eb.ref('pikkuLock.token'))
              .else(eb('pikkuLock.token', '+', 1))
              .end(),
          }))
          .where((eb) =>
            eb.or([
              eb('pikkuLock.holder', '=', holder),
              eb('pikkuLock.expiresAt', '<=', now),
            ])
          )
      )
      .returningAll()
      .executeTakeFirst()
    return row ? toLease(row) : null
  }

  async refresh(lease: LockLease, ttlMs: number) {
    const now = new Date()
    const row = await this.db
      .updateTable('pikkuLock')
      .set({ expiresAt: new Date(now.getTime() + ttlMs) })
      .where('key', '=', lease.key)
      .where('holder', '=', lease.holder)
      .where('token', '=', lease.token)
      .where('expiresAt', '>', now)
      .returningAll()
      .executeTakeFirst()
    return row ? toLease(row) : null
  }

  async release(lease: LockLease) {
    await this.db
      .updateTable('pikkuLock')
      .set({ expiresAt: new Date(0) })
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
      .where('expiresAt', '>', new Date())
      .executeTakeFirst()
    return row ? toLease(row) : null
  }
}
