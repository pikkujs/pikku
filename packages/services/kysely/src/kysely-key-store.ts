import type {
  KeyRecord,
  KeyRecordStatus,
  KeyStore,
  StoreContext,
} from '@pikku/core/keypair'
import { PostgresAdapter, sql, type Kysely, type UpdateResult } from 'kysely'
import type { KyselyPikkuDB, PikkuKeyTable } from './kysely-tables.js'
import { parseJson } from './kysely-json.js'
import { isMysql } from './kysely-upsert.js'
import { keySchema } from './schema/key.schema.js'
import { requirePikkuSchema } from './schema/index.js'

type DB = Kysely<KyselyPikkuDB>

const STATUSES: readonly KeyRecordStatus[] = [
  'minting',
  'pending',
  'active',
  'previous',
  'retired',
]

/** Columns read as they are stored; `metadata` is read as text, see `select`. */
const PLAIN_COLUMNS = [
  'kid',
  'name',
  'scopeKey',
  'version',
  'algorithm',
  'purpose',
  'publicKey',
  'status',
  'createdAt',
  'activatedAt',
  'publishedAt',
  'verifyUntil',
  'retiredAt',
  'custody',
  'privateRef',
  'privateWrapped',
  'rev',
] as const

/** Rows to a statement when importing; bounds the parameters of one insert. */
const INSERT_BATCH = 50
/** Kids to a lookup when importing; bounds the parameters of one `in (...)`. */
const LOOKUP_BATCH = 200

/**
 * A `metadata` value as a statement parameter.
 *
 * Postgres drivers that know the column is `jsonb` serialise a string
 * parameter as a JSON *string* (postgres.js does), which would store the JSON
 * text quoted inside the document. Passing it as text and casting in SQL
 * stores the document itself on every driver. SQLite and MySQL take the text
 * as it is.
 */
const jsonParam = (db: DB, json: string | null) =>
  json !== null && db.getExecutor().adapter instanceof PostgresAdapter
    ? sql<string>`cast(cast(${json} as text) as jsonb)`
    : json

/** A row ready to write: `metadata` as `jsonParam` makes it. */
const writable = (db: DB, row: PikkuKeyTable) => ({
  ...row,
  metadata: jsonParam(db, row.metadata),
})

const changed = (result: UpdateResult) => Number(result.numUpdatedRows) > 0

/** Thrown inside our own transaction to roll it back when a compare-and-set loses. */
class Lost<T> {
  constructor(readonly value: T) {}
}

/**
 * The text a timestamp column holds, whatever the driver made of it.
 *
 * `SerializePlugin` (SQLite) turns an ISO 8601 string into a `Date` on the way
 * out. Callers pass `toISOString()` values, which round-trip exactly.
 */
const isoText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  return value instanceof Date ? value.toISOString() : String(value as string)
}

/** Ciphertext as the string it was stored as, even if a plugin parsed it as JSON. */
const cipherText = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  return typeof value === 'string' ? value : JSON.stringify(value)
}

const slotFields = (status: KeyRecordStatus) => ({
  activeSlot: status === 'active' ? 1 : null,
  pendingSlot: status === 'pending' ? 1 : null,
})

/**
 * Every write of `status` goes through here, so the status, the two slots and
 * `retiredAt` always move together ("retired iff `retired_at`", and a slot is
 * 1 exactly while the row holds it). The table has no CHECK constraints to
 * enforce the tie; this is the single path that keeps it.
 */
const statusFields = (status: KeyRecordStatus, retiredAt?: string) => ({
  status,
  ...slotFields(status),
  retiredAt: status === 'retired' ? (retiredAt ?? null) : null,
})

const assertConsistent = (rec: KeyRecord) => {
  if (!STATUSES.includes(rec.status)) {
    throw new Error(`KeyStore: unknown status '${rec.status}'`)
  }
  if ((rec.status === 'retired') !== (rec.retiredAt != null)) {
    throw new Error(
      'KeyStore: a key is retired if and only if it has retiredAt'
    )
  }
}

/** The whole row for `rec`: the status fields are derived, never taken from the caller. */
const toRow = (rec: KeyRecord): PikkuKeyTable => {
  assertConsistent(rec)
  return {
    kid: rec.kid,
    name: rec.name,
    scopeKey: rec.scopeKey,
    version: rec.version,
    algorithm: rec.algorithm,
    purpose: rec.purpose,
    publicKey: rec.publicKey ?? null,
    createdAt: rec.createdAt,
    activatedAt: rec.activatedAt ?? null,
    publishedAt: rec.publishedAt ?? null,
    verifyUntil: rec.verifyUntil ?? null,
    custody: rec.custody,
    privateRef: rec.privateRef ?? null,
    privateWrapped: rec.privateWrapped ?? null,
    metadata: rec.metadata == null ? null : JSON.stringify(rec.metadata),
    rev: rec.rev ?? 0,
    ...statusFields(rec.status, rec.retiredAt),
  }
}

const toRecord = (row: Record<string, unknown>): KeyRecord => {
  const rec: Record<string, unknown> = {
    kid: row.kid,
    name: row.name,
    scopeKey: row.scopeKey,
    version: Number(row.version),
    algorithm: row.algorithm,
    purpose: row.purpose,
    status: row.status,
    createdAt: isoText(row.createdAt),
    custody: row.custody,
    rev: Number(row.rev),
  }
  const optional = {
    publicKey: row.publicKey,
    activatedAt: isoText(row.activatedAt),
    publishedAt: isoText(row.publishedAt),
    verifyUntil: isoText(row.verifyUntil),
    retiredAt: isoText(row.retiredAt),
    privateRef: row.privateRef,
    privateWrapped: cipherText(row.privateWrapped),
    metadata: parseJson(row.metadata),
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value !== null && value !== undefined) rec[key] = value
  }
  return rec as unknown as KeyRecord
}

/** Import order: rows that free a slot go first, so no row meets the one it replaces. */
const importRank = (status: KeyRecordStatus) =>
  status === 'active' ? 2 : status === 'pending' ? 1 : 0

/**
 * The key ledger on the `pikku_key` table: what `KeyStore` means for any
 * database Kysely speaks to (SQLite, PostgreSQL, MySQL).
 *
 * Construct it over a `Kysely` and call `init()`, which refuses to start when
 * the table is missing (`pikku db generate` writes it for an app whose
 * functions use `keyService`). It creates nothing.
 *
 * Every transition is one guarded statement: it names the status it expects, so
 * a concurrent change makes it match no row and the method return `false`. The
 * one-active and one-pending rules are unique indexes over `activeSlot` and
 * `pendingSlot`, which the status fields keep in step (see `statusFields`); no
 * method relies on a CHECK constraint or on a partial index.
 *
 * Pass `{ tx }` in the context to run a call inside your transaction. `promote`
 * and `importRecords` then run in that transaction, under a savepoint so a lost
 * compare-and-set leaves nothing behind; without it they open their own.
 *
 * Callers pass timestamps as `new Date().toISOString()`. A string in another
 * shape is stored as written but may come back normalised on SQLite.
 */
export class KyselyKeyStore implements KeyStore {
  private initialized = false
  private savepoints = 0

  constructor(private db: DB) {}

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, keySchema)
    this.initialized = true
  }

  /** The caller's transaction, or this store's own connection when it is already inside one. */
  private joined(ctx?: StoreContext): DB | undefined {
    const tx = ctx?.tx as DB | undefined
    if (tx) return tx
    return this.db.isTransaction ? this.db : undefined
  }

  private exec(ctx?: StoreContext): DB {
    return this.joined(ctx) ?? this.db
  }

  /**
   * Run `fn` atomically. `keep` says whether its result is to be kept: when it
   * is not (a compare-and-set lost halfway), everything `fn` wrote is undone and
   * the result is still returned.
   */
  private async transact<T>(
    ctx: StoreContext | undefined,
    fn: (db: DB) => Promise<T>,
    keep: (value: T) => boolean = () => true
  ): Promise<T> {
    const outer = this.joined(ctx)
    if (outer) {
      const name = sql.id(`pikku_key_sp_${this.savepoints++}`)
      await sql`savepoint ${name}`.execute(outer)
      let value: T
      try {
        value = await fn(outer)
      } catch (error) {
        await sql`rollback to savepoint ${name}`.execute(outer)
        throw error
      }
      await (
        keep(value)
          ? sql`release savepoint ${name}`
          : sql`rollback to savepoint ${name}`
      ).execute(outer)
      return value
    }
    try {
      return await this.db.transaction().execute(async (trx) => {
        const value = await fn(trx)
        if (!keep(value)) throw new Lost(value)
        return value
      })
    } catch (error) {
      if (error instanceof Lost) return error.value as T
      throw error
    }
  }

  /** A select of the whole row. `metadata` is read as text so no driver or plugin re-keys its JSON. */
  private select(db: DB) {
    return db
      .selectFrom('pikkuKey')
      .select([...PLAIN_COLUMNS])
      .select((eb) =>
        eb
          .cast<string | null>('metadata', isMysql(db) ? 'char' : 'text')
          .as('metadata')
      )
  }

  async list(name: string, scopeKey: string, ctx?: StoreContext) {
    const rows = await this.select(this.exec(ctx))
      .where('name', '=', name)
      .where('scopeKey', '=', scopeKey)
      .orderBy('version', 'desc')
      .execute()
    return rows.map(toRecord)
  }

  async get(kid: string, ctx?: StoreContext) {
    const row = await this.select(this.exec(ctx))
      .where('kid', '=', kid)
      .executeTakeFirst()
    return row ? toRecord(row) : undefined
  }

  async listScopeKeys(name: string) {
    const rows = await this.db
      .selectFrom('pikkuKey')
      .select('scopeKey')
      .distinct()
      .where('name', '=', name)
      .execute()
    // Sorted here, not in SQL, so every store orders by the same rule (code units).
    return rows.map((row) => row.scopeKey).sort()
  }

  async insertPending(rec: KeyRecord, ctx?: StoreContext) {
    if (rec.status !== 'minting' && rec.status !== 'pending') {
      throw new Error('KeyStore: insertPending takes a minting or pending row')
    }
    const db = this.exec(ctx)
    await db
      .insertInto('pikkuKey')
      .values(writable(db, toRow(rec)))
      .execute()
  }

  async markPlaced(
    kid: string,
    publicKey: string,
    _now: string,
    ctx?: StoreContext
  ) {
    return changed(
      await this.exec(ctx)
        .updateTable('pikkuKey')
        .set({ ...statusFields('pending'), publicKey })
        .where('kid', '=', kid)
        .where('status', '=', 'minting')
        .executeTakeFirst()
    )
  }

  async markPublished(kid: string, at: string, ctx?: StoreContext) {
    return changed(
      await this.exec(ctx)
        .updateTable('pikkuKey')
        .set({ publishedAt: at })
        .where('kid', '=', kid)
        .where('status', '=', 'pending')
        .where('publishedAt', 'is', null)
        .executeTakeFirst()
    )
  }

  async promote(
    args: {
      pendingKid: string
      activeKid?: string
      verifyUntil?: string
      now: string
    },
    ctx?: StoreContext
  ) {
    return this.transact(
      ctx,
      async (db) => {
        const pending = await db
          .selectFrom('pikkuKey')
          .select(['name', 'scopeKey', 'status'])
          .where('kid', '=', args.pendingKid)
          .executeTakeFirst()
        if (!pending || pending.status !== 'pending') return false

        if (args.activeKid) {
          const active = await db
            .selectFrom('pikkuKey')
            .select(['name', 'scopeKey', 'status'])
            .where('kid', '=', args.activeKid)
            .executeTakeFirst()
          if (
            !active ||
            active.status !== 'active' ||
            active.name !== pending.name ||
            active.scopeKey !== pending.scopeKey
          ) {
            return false
          }
          // Demote before promote: the slot indexes are checked per row and
          // Postgres cannot defer them.
          const demoted = await db
            .updateTable('pikkuKey')
            .set({
              ...statusFields('previous'),
              verifyUntil: args.verifyUntil ?? null,
            })
            .where('kid', '=', args.activeKid)
            .where('status', '=', 'active')
            .executeTakeFirst()
          if (!changed(demoted)) return false
        } else {
          const other = await db
            .selectFrom('pikkuKey')
            .select('kid')
            .where('name', '=', pending.name)
            .where('scopeKey', '=', pending.scopeKey)
            .where('status', '=', 'active')
            .executeTakeFirst()
          if (other) return false
        }

        return changed(
          await db
            .updateTable('pikkuKey')
            .set({ ...statusFields('active'), activatedAt: args.now })
            .where('kid', '=', args.pendingKid)
            .where('status', '=', 'pending')
            .executeTakeFirst()
        )
      },
      (promoted) => promoted
    )
  }

  async retire(kid: string, now: string, ctx?: StoreContext) {
    return changed(
      await this.exec(ctx)
        .updateTable('pikkuKey')
        .set(statusFields('retired', now))
        .where('kid', '=', kid)
        .where('status', '!=', 'retired')
        .executeTakeFirst()
    )
  }

  async firstActivate(rec: KeyRecord, ctx?: StoreContext) {
    const db = this.exec(ctx)
    const activeExists = async () =>
      (await db
        .selectFrom('pikkuKey')
        .select('kid')
        .where('name', '=', rec.name)
        .where('scopeKey', '=', rec.scopeKey)
        .where('status', '=', 'active')
        .executeTakeFirst()) !== undefined
    if (await activeExists()) return false
    const row = toRow({
      ...rec,
      status: 'active',
      retiredAt: undefined,
      activatedAt: rec.activatedAt ?? rec.createdAt,
    })
    try {
      await db.insertInto('pikkuKey').values(writable(db, row)).execute()
    } catch (error) {
      // Lost the race for the slot to another writer: that is `false`, not a
      // failure. Inside a caller's transaction the statement has aborted it
      // (Postgres), so there is nothing to ask; the error stands.
      if (!this.joined(ctx) && (await activeExists())) return false
      throw error
    }
    return true
  }

  async updateCustody(
    kid: string,
    expect: { rev: number },
    set: {
      privateWrapped?: string | null
      metadata?: Record<string, unknown> | null
    },
    ctx?: StoreContext
  ) {
    const db = this.exec(ctx)
    return changed(
      await db
        .updateTable('pikkuKey')
        .set((eb) => ({
          rev: eb('rev', '+', 1),
          ...('privateWrapped' in set
            ? { privateWrapped: set.privateWrapped ?? null }
            : {}),
          ...('metadata' in set
            ? {
                metadata: jsonParam(
                  db,
                  set.metadata == null ? null : JSON.stringify(set.metadata)
                ),
              }
            : {}),
        }))
        .where('kid', '=', kid)
        .where('rev', '=', expect.rev)
        .executeTakeFirst()
    )
  }

  /**
   * `insert` skips a kid that is already there. `reconcile` rewrites it
   * (`rev` + 1) and inserts the rest. Existing rows are updated before any new
   * row goes in, and in each phase the rows that leave `active` or `pending`
   * go first (retired, then pending, then active), so no statement meets the
   * slot a later one frees. It is not one `INSERT ... ON CONFLICT`, because
   * Postgres checks the non-deferrable slot indexes row by row.
   *
   * All or nothing. Two reconciles of the same names at once are not
   * serialised here (hold a lease); the slot indexes make a second one fail
   * rather than corrupt the ledger.
   */
  async importRecords(
    recs: KeyRecord[],
    opts: { mode: 'insert' | 'reconcile' },
    ctx?: StoreContext
  ) {
    const rows = recs.map(toRow)
    return this.transact(ctx, async (db) => {
      const known = new Map<string, number>()
      for (let i = 0; i < rows.length; i += LOOKUP_BATCH) {
        const found = await db
          .selectFrom('pikkuKey')
          .select(['kid', 'rev'])
          .where(
            'kid',
            'in',
            rows.slice(i, i + LOOKUP_BATCH).map((row) => row.kid)
          )
          .execute()
        for (const row of found) known.set(row.kid, Number(row.rev))
      }

      const byRank = (a: PikkuKeyTable, b: PikkuKeyTable) =>
        importRank(a.status as KeyRecordStatus) -
        importRank(b.status as KeyRecordStatus)
      const existing = rows.filter((row) => known.has(row.kid))
      const fresh = rows.filter((row) => !known.has(row.kid)).sort(byRank)

      let updated = 0
      if (opts.mode === 'reconcile') {
        for (const row of [...existing].sort(byRank)) {
          const { kid, rev: _rev, ...columns } = row
          await db
            .updateTable('pikkuKey')
            .set((eb) => ({
              ...columns,
              metadata: jsonParam(db, columns.metadata),
              rev: eb('rev', '+', 1),
            }))
            .where('kid', '=', kid)
            .execute()
          updated += 1
        }
      }
      for (let i = 0; i < fresh.length; i += INSERT_BATCH) {
        const group = fresh.slice(i, i + INSERT_BATCH)
        // A batch never mixes ranks, so one statement never holds a row that
        // needs a slot another row in it frees.
        const ranks = new Set(
          group.map((row) => importRank(row.status as KeyRecordStatus))
        )
        for (const rank of [...ranks].sort((a, b) => a - b)) {
          await db
            .insertInto('pikkuKey')
            .values(
              group
                .filter(
                  (row) => importRank(row.status as KeyRecordStatus) === rank
                )
                .map((row) => writable(db, row))
            )
            .execute()
        }
      }
      return {
        inserted: fresh.length,
        updated,
        skipped: opts.mode === 'insert' ? existing.length : 0,
      }
    })
  }
}
