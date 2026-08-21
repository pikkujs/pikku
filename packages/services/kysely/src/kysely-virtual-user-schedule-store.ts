import type { Kysely, Selectable } from 'kysely'
import type {
  VirtualUserBudget,
  VirtualUserDisposition,
  VirtualUserScheduleInput,
  VirtualUserScheduleRecord,
  VirtualUserScheduleStore,
} from '@pikku/core/virtual-user'
import {
  DEFAULT_MAX_INTERVAL_MS,
  DEFAULT_MIN_INTERVAL_MS,
} from '@pikku/core/virtual-user'
import type {
  KyselyPikkuDB,
  VirtualUserScheduleTable,
} from './kysely-tables.js'
import { parseJson } from './kysely-json.js'
import { requirePikkuSchema } from './schema/index.js'
import { virtualUserScheduleSchema } from './schema/virtual-user-schedule.schema.js'

/**
 * Keeps each persona's cadence in a `virtualUserSchedule` table.
 *
 * Wiring this is what turns virtual users from something a person triggers into
 * something that happens: without it, {@link KyselyVirtualUserRunStore} still
 * records every run, and every run still had someone behind it. Two services
 * rather than one so that an app can want the history without wanting the bill.
 *
 * Reads and writes the same way the run store does — JSON as text, timestamps
 * as ISO strings, flags as 0/1 — so a project on SQLite and one on Postgres
 * hold the same bytes and `SerializePlugin` is optional on both.
 */
export class KyselyVirtualUserScheduleStore implements VirtualUserScheduleStore {
  private initialized = false

  constructor(private db: Kysely<KyselyPikkuDB>) {}

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, virtualUserScheduleSchema)
    this.initialized = true
  }

  async set(
    schedule: VirtualUserScheduleInput
  ): Promise<VirtualUserScheduleRecord> {
    await this.init()
    // Read-then-write rather than a partial upsert: a schedule is configuration
    // written by a person, and the alternative is two dialects of "leave the
    // columns I did not mention alone".
    const existing = await this.get(schedule.persona)
    const merged: VirtualUserScheduleRecord = {
      persona: schedule.persona,
      enabled: schedule.enabled ?? existing?.enabled ?? false,
      disposition: schedule.disposition ?? existing?.disposition ?? 'realistic',
      goals: [...(schedule.goals ?? existing?.goals ?? [])],
      budget:
        schedule.budget === undefined
          ? (existing?.budget ?? null)
          : schedule.budget,
      minIntervalMs:
        schedule.minIntervalMs ??
        existing?.minIntervalMs ??
        DEFAULT_MIN_INTERVAL_MS,
      maxIntervalMs:
        schedule.maxIntervalMs ??
        existing?.maxIntervalMs ??
        DEFAULT_MAX_INTERVAL_MS,
      // A new schedule is due immediately. Enabling one is a deliberate act, and
      // waiting a random half-day to find out whether it works is not a feature.
      nextRunAt: schedule.nextRunAt ?? existing?.nextRunAt ?? new Date(),
      lastRunId: existing?.lastRunId ?? null,
      lastRunAt: existing?.lastRunAt ?? null,
    }

    const values = {
      persona: merged.persona,
      enabled: merged.enabled ? 1 : 0,
      disposition: merged.disposition,
      goals: JSON.stringify(merged.goals),
      budget: merged.budget ? JSON.stringify(merged.budget) : null,
      minIntervalMs: String(merged.minIntervalMs),
      maxIntervalMs: String(merged.maxIntervalMs),
      nextRunAt: merged.nextRunAt.toISOString(),
    }

    await this.db
      .insertInto('virtualUserSchedule')
      .values(values)
      .onConflict((oc) =>
        oc.column('persona').doUpdateSet({
          enabled: values.enabled,
          disposition: values.disposition,
          goals: values.goals,
          budget: values.budget,
          minIntervalMs: values.minIntervalMs,
          maxIntervalMs: values.maxIntervalMs,
          nextRunAt: values.nextRunAt,
        })
      )
      .execute()

    return merged
  }

  async get(persona: string): Promise<VirtualUserScheduleRecord | null> {
    await this.init()
    const row = await this.db
      .selectFrom('virtualUserSchedule')
      .selectAll()
      .where('persona', '=', persona)
      .executeTakeFirst()
    return row ? this.toRecord(row) : null
  }

  async list(): Promise<VirtualUserScheduleRecord[]> {
    await this.init()
    const rows = await this.db
      .selectFrom('virtualUserSchedule')
      .selectAll()
      .orderBy('persona', 'asc')
      .execute()
    return rows.map((row) => this.toRecord(row))
  }

  async due(now: Date): Promise<VirtualUserScheduleRecord[]> {
    await this.init()
    const rows = await this.db
      .selectFrom('virtualUserSchedule')
      .selectAll()
      .where('enabled', '=', 1)
      .where('nextRunAt', '<=', now.toISOString())
      .orderBy('nextRunAt', 'asc')
      .execute()
    return rows.map((row) => this.toRecord(row))
  }

  async claim(
    persona: string,
    claim: { nextRunAt: Date; runId: string | null; at: Date }
  ): Promise<void> {
    await this.init()
    await this.db
      .updateTable('virtualUserSchedule')
      .set({
        nextRunAt: claim.nextRunAt.toISOString(),
        // A claim with no run id is the one written before dispatch, and must
        // not blank out which run this persona last managed to start.
        ...(claim.runId
          ? { lastRunId: claim.runId, lastRunAt: claim.at.toISOString() }
          : {}),
      })
      .where('persona', '=', persona)
      .execute()
  }

  async remove(persona: string): Promise<void> {
    await this.init()
    await this.db
      .deleteFrom('virtualUserSchedule')
      .where('persona', '=', persona)
      .execute()
  }

  private toRecord(
    row: Selectable<VirtualUserScheduleTable>
  ): VirtualUserScheduleRecord {
    return {
      persona: row.persona,
      enabled: Boolean(row.enabled),
      disposition: row.disposition as VirtualUserDisposition,
      goals: parseJson(row.goals) ?? [],
      budget: row.budget
        ? ((parseJson(row.budget) ?? null) as VirtualUserBudget | null)
        : null,
      minIntervalMs: Number(row.minIntervalMs),
      maxIntervalMs: Number(row.maxIntervalMs),
      nextRunAt: new Date(row.nextRunAt),
      lastRunId: row.lastRunId,
      lastRunAt: row.lastRunAt ? new Date(row.lastRunAt) : null,
    }
  }
}
