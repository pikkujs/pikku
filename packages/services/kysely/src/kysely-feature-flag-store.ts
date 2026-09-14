import type {
  FeatureFlagStore,
  FlagOverrideRow,
  FlagRow,
} from '@pikku/core/services'
import type {
  CachedFlagSourceOptions,
  DeclaredFlag,
  FlagConfigSnapshot,
  FlagSubject,
} from '@pikku/core/flag'
import { CachedFlagSource, subjectIdOf } from '@pikku/core/flag'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { requirePikkuSchema } from './schema/index.js'
import { flagSchema } from './schema/flag.schema.js'

export type KyselyFeatureFlagStoreOptions = CachedFlagSourceOptions

/**
 * Reads the stored `anyOf`, which arrives as either shape.
 *
 * The column holds JSON text, but `SerializePlugin` parses it back on the way
 * out of a sqlite-style dialect while postgres hands over the string as
 * written. One store serving both engines has to accept both, and the column
 * type can only describe one of them.
 */
const parseAnyOf = (value: unknown): string[] | undefined => {
  if (!value) return undefined
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value)
          } catch {
            return undefined
          }
        })()
      : value
  return Array.isArray(parsed)
    ? parsed.filter((v): v is string => typeof v === 'string')
    : undefined
}

/**
 * Feature flags backed by two tables pikku owns.
 *
 * The full store, not just a source: the declaration lifecycle and the operator
 * controls both live here, which is what makes the console's Flags tab
 * writable. A third-party provider implements `FeatureFlagSource` alone.
 */
export class KyselyFeatureFlagStore
  extends CachedFlagSource
  implements FeatureFlagStore
{
  private initialized = false

  constructor(
    private db: Kysely<KyselyPikkuDB>,
    options: KyselyFeatureFlagStoreOptions = {}
  ) {
    super({ ttlMs: 10_000, ...options })
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    await requirePikkuSchema(this.db, flagSchema)
    this.initialized = true
  }

  protected async fetchSnapshot(): Promise<FlagConfigSnapshot> {
    const [flags, overrides] = await Promise.all([
      this.db
        .selectFrom('pikkuFeatureFlags')
        .select(['name', 'enabled', 'rolloutPercent'])
        .execute(),
      this.db
        .selectFrom('pikkuFeatureFlagOverrides')
        .select(['flag', 'subjectId', 'enabled'])
        .execute(),
    ])

    const snapshot: FlagConfigSnapshot = {}
    for (const flag of flags) {
      snapshot[flag.name] = {
        enabled: !!flag.enabled,
        rolloutPercent: flag.rolloutPercent ?? null,
        overrides: {},
      }
    }
    for (const override of overrides) {
      const row = snapshot[override.flag]
      if (row) {
        row.overrides[override.subjectId] = !!override.enabled
      }
    }

    return snapshot
  }

  async syncFlags(flags: DeclaredFlag[]): Promise<void> {
    this.setDeclared(flags)

    await this.db.transaction().execute(async (trx) => {
      for (const flag of flags) {
        await trx
          .insertInto('pikkuFeatureFlags')
          .values({
            name: flag.name,
            description: flag.description ?? null,
            anyOf: flag.anyOf ? JSON.stringify(flag.anyOf) : null,
            declared: true,
          })
          .onConflict((oc) =>
            // `enabled`, `rolloutPercent` and every override are the operator's
            // and are never touched here. A deploy that re-enabled a flag
            // somebody killed an hour earlier would make the kill switch
            // useless exactly when it is being relied on.
            oc.column('name').doUpdateSet((eb) => ({
              description: eb.ref('excluded.description'),
              anyOf: eb.ref('excluded.anyOf'),
              declared: true,
            }))
          )
          .execute()
      }

      const markStale = trx
        .updateTable('pikkuFeatureFlags')
        .set({ declared: false })
      await (
        flags.length > 0
          ? markStale.where(
              'name',
              'not in',
              flags.map((f) => f.name)
            )
          : markStale
      ).execute()
    })

    this.invalidate()
  }

  async listFlags(): Promise<FlagRow[]> {
    const rows = await this.db
      .selectFrom('pikkuFeatureFlags')
      .selectAll()
      .orderBy('name')
      .execute()

    return rows.map((row) => ({
      name: row.name,
      description: row.description ?? undefined,
      anyOf: parseAnyOf(row.anyOf),
      enabled: !!row.enabled,
      rolloutPercent: row.rolloutPercent ?? null,
      declared: !!row.declared,
    }))
  }

  async listOverrides(key: string): Promise<FlagOverrideRow[]> {
    const rows = await this.db
      .selectFrom('pikkuFeatureFlagOverrides')
      .selectAll()
      .where('flag', '=', key)
      .orderBy('subjectId')
      .execute()

    return rows.map((row) => ({
      subjectId: row.subjectId,
      subjectKind: row.subjectKind,
      enabled: !!row.enabled,
      grantedBy: row.grantedBy ?? undefined,
      // ISO 8601 rather than the driver's date: the row crosses an RPC boundary
      // to reach the console, and every driver spells a timestamp differently.
      grantedAt: row.grantedAt
        ? new Date(row.grantedAt).toISOString()
        : undefined,
    }))
  }

  async setEnabled(
    key: string,
    enabled: boolean,
    actor?: string,
    note?: string
  ): Promise<void> {
    await this.db
      .updateTable('pikkuFeatureFlags')
      .set({
        enabled,
        updatedBy: actor ?? null,
        note: note ?? null,
        updatedAt: new Date(),
      })
      .where('name', '=', key)
      .execute()
    this.invalidate()
  }

  async setRollout(
    key: string,
    percent: number | null,
    actor?: string
  ): Promise<void> {
    if (percent !== null && (percent < 0 || percent > 100)) {
      throw new Error(
        `Feature flag '${key}': rollout must be between 0 and 100, got ${percent}.`
      )
    }
    await this.db
      .updateTable('pikkuFeatureFlags')
      .set({
        rolloutPercent: percent === null ? null : Math.round(percent),
        updatedBy: actor ?? null,
        updatedAt: new Date(),
      })
      .where('name', '=', key)
      .execute()
    this.invalidate()
  }

  async setOverride(
    key: string,
    subject: FlagSubject,
    enabled: boolean,
    actor?: string
  ): Promise<void> {
    const subjectId = subjectIdOf(subject)
    if (!subjectId) {
      throw new Error(
        `Feature flag '${key}': an override needs an organization or a user to be about.`
      )
    }
    await this.db
      .insertInto('pikkuFeatureFlagOverrides')
      .values({
        flag: key,
        subjectId,
        subjectKind: subject.organizationId ? 'organization' : 'user',
        enabled,
        grantedBy: actor ?? null,
        grantedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['flag', 'subjectId']).doUpdateSet((eb) => ({
          enabled: eb.ref('excluded.enabled'),
          subjectKind: eb.ref('excluded.subjectKind'),
          grantedBy: eb.ref('excluded.grantedBy'),
          // The column defaults on insert only, and the panel reads this as
          // when the pin was last granted — not when the subject was first
          // pinned to something else.
          grantedAt: eb.ref('excluded.grantedAt'),
        }))
      )
      .execute()
    this.invalidate()
  }

  async clearOverride(key: string, subject: FlagSubject): Promise<void> {
    const subjectId = subjectIdOf(subject)
    if (!subjectId) {
      return
    }
    await this.db
      .deleteFrom('pikkuFeatureFlagOverrides')
      .where('flag', '=', key)
      .where('subjectId', '=', subjectId)
      .execute()
    this.invalidate()
  }

  async findStaleFlags(): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pikkuFeatureFlags')
      .select('name')
      .where('declared', '=', false)
      .orderBy('name')
      .execute()
    return rows.map((row) => row.name)
  }

  /**
   * Deletes what is still undeclared, and reports only what it deleted.
   *
   * The `declared = false` predicate is repeated on the delete rather than
   * carried over from the read: a deploy running `syncFlags` between the two
   * would redeclare a flag, and deleting on the earlier answer would take a
   * live flag and cascade away every override an operator had set on it.
   */
  async pruneFlags(): Promise<string[]> {
    const deleted = await this.db
      .deleteFrom('pikkuFeatureFlags')
      .where('declared', '=', false)
      .returning('name')
      .execute()
    if (deleted.length === 0) {
      return []
    }
    this.invalidate()
    return deleted.map((row) => row.name).sort()
  }
}
