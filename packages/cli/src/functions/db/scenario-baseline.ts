import { createHash } from 'node:crypto'
import type { ResolvedDb } from './local-db.js'

/**
 * Where the captured copies live: a schema of its own in Postgres, a name
 * prefix in sqlite, which has no schemas to hide them in.
 */
export const BASELINE_SCHEMA = 'pikku_scenario_baseline'
export const BASELINE_PREFIX = `${BASELINE_SCHEMA}__`

/**
 * The seed layer is the database as the suite found it. The feature layer is
 * that plus whatever a feature's `before` hook built, and it exists so a
 * scenario can be rolled back without losing its feature's fixtures.
 */
export const SEED_LAYER = 'seed'
export const FEATURE_LAYER = 'feature'
export const LAYERS = [SEED_LAYER, FEATURE_LAYER]

/** Postgres truncates identifiers at 63 bytes, silently colliding two tables. */
const MAX_IDENTIFIER_LENGTH = 63

export interface ScenarioBaselineOptions {
  /**
   * Tables left alone by both the capture and the restore.
   *
   * The session tables belong here: an actor signs in once for the whole run,
   * and rolling its session back to a baseline taken before the sign-in logs
   * every actor out mid-suite.
   */
  keep?: string[]
}

export interface ScenarioBaseline {
  /** The tables this baseline holds a copy of, qualified as the dialect names them. */
  tables: string[]
  /** Put every captured table back as the active layer holds it. */
  restore(): Promise<void>
  /**
   * Capture the database as it stands now and make that the active layer, so
   * later restores come back to here rather than to the seed.
   */
  pushFeatureLayer(): Promise<void>
  /** Make the seed the active layer again. */
  popFeatureLayer(): Promise<void>
  /** Drop the captured copies. A database left with them reads as schema drift. */
  drop(): Promise<void>
}

/** An identifier, quoted so its casing and any punctuation survive the parser. */
export const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`

/**
 * A copy's name, stable for a given layer and source table and short enough for
 * Postgres. Long names keep a readable prefix and earn a hash suffix, because a
 * blind truncation maps two different tables onto one copy.
 */
export const copyName = (parts: string[]): string => {
  const raw = parts.join('__')
  if (raw.length <= MAX_IDENTIFIER_LENGTH) return raw
  const hash = createHash('sha1').update(raw).digest('hex').slice(0, 8)
  return `${raw.slice(0, MAX_IDENTIFIER_LENGTH - 9)}_${hash}`
}

/** Matches a `keep` entry against a table, bare or schema-qualified. */
export const keepMatcher = (keep: string[]) => {
  const names = new Set(keep.map((name) => name.toLowerCase()))
  return (schema: string | null, table: string) =>
    names.has(table.toLowerCase()) ||
    (schema !== null && names.has(`${schema}.${table}`.toLowerCase()))
}

export async function captureScenarioBaseline(
  resolved: ResolvedDb,
  options: ScenarioBaselineOptions = {}
): Promise<ScenarioBaseline> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Scenario database reset refused: NODE_ENV=production. It replaces live rows with seed data — it only runs in dev.`
    )
  }
  // `isLocalUrl` on the environment's apiUrl says nothing about where the
  // database is: a local server can be configured against a remote postgres,
  // and this replaces every row it finds.
  if (resolved.dialect === 'postgres' && resolved.mode === 'url') {
    const { isLocalUrl } = await import('../commands/environment.js')
    if (!isLocalUrl(resolved.connectionString ?? '')) {
      throw new Error(
        `Scenario database reset refused: postgresUrl points at a host other than this machine. It rolls every table back to a copy taken at the start of the run, so it only runs against a database on this machine.`
      )
    }
  }
  // Imported here rather than at the top because both dialects import the
  // shared helpers back out of this module, and a static edge each way is a
  // cycle.
  if (resolved.dialect === 'sqlite') {
    const { captureSqliteScenarioBaseline } =
      await import('./sqlite/scenario-baseline.js')
    return captureSqliteScenarioBaseline(resolved, options)
  }
  const { capturePostgresScenarioBaseline } =
    await import('./postgres/scenario-baseline.js')
  return capturePostgresScenarioBaseline(resolved, options)
}
