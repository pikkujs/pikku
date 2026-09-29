import type {
  DeclaredTriggerSource,
  TriggerSourceResult,
  TriggerSourceRow,
  TriggerSourceStore,
} from '@pikku/core/services'
import type { Kysely, Selectable } from 'kysely'
import type { KyselyPikkuDB, PikkuTriggerSourceTable } from './kysely-tables.js'
import { requirePikkuSchema } from './schema/index.js'
import { triggerSourceSchema } from './schema/trigger-source.schema.js'

const parseState = (value: unknown) => {
  if (!value) return null
  if (typeof value !== 'string') return value as Record<string, unknown>
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}

const toRow = (row: Selectable<PikkuTriggerSourceTable>): TriggerSourceRow => ({
  name: row.name,
  kind: row.kind as TriggerSourceRow['kind'],
  declared: !!row.declared,
  status: row.status,
  state: parseState(row.state),
  detail: row.detail,
  updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
})

export class KyselyTriggerSourceStore implements TriggerSourceStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, triggerSourceSchema)
    this.initialized = true
  }

  async syncTriggerSources(sources: DeclaredTriggerSource[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      for (const { name, kind } of sources) {
        await trx
          .insertInto('pikkuTriggerSource')
          .values({ name, kind, declared: true })
          .onConflict((oc) =>
            oc.column('name').doUpdateSet({ kind, declared: true })
          )
          .execute()
      }
      const markStale = trx
        .updateTable('pikkuTriggerSource')
        .set({ declared: false })
      await (
        sources.length > 0
          ? markStale.where(
              'name',
              'not in',
              sources.map((s) => s.name)
            )
          : markStale
      ).execute()
    })
  }

  async listTriggerSources(): Promise<TriggerSourceRow[]> {
    const rows = await this.db
      .selectFrom('pikkuTriggerSource')
      .selectAll()
      .orderBy('name')
      .execute()
    return rows.map(toRow)
  }

  async getTriggerSource(name: string): Promise<TriggerSourceRow | null> {
    const row = await this.db
      .selectFrom('pikkuTriggerSource')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst()
    return row ? toRow(row) : null
  }

  async recordTriggerSource(
    name: string,
    result: TriggerSourceResult
  ): Promise<void> {
    const { numUpdatedRows } = await this.db
      .updateTable('pikkuTriggerSource')
      .set({
        status: result.status,
        ...(result.state !== undefined
          ? { state: result.state ? JSON.stringify(result.state) : null }
          : {}),
        detail: result.detail ?? null,
        updatedAt: new Date(),
      })
      .where('name', '=', name)
      .executeTakeFirst()
    if (!numUpdatedRows) {
      throw new Error(`Unknown trigger source: ${name}`)
    }
  }

  async deleteTriggerSource(name: string): Promise<void> {
    await this.db
      .deleteFrom('pikkuTriggerSource')
      .where('name', '=', name)
      .execute()
  }
}
