import { MIGRATION_TRACKING_TABLE } from '@pikku/migrator-sql'
import { loadSqliteRuntime } from '@pikku/migrator-sql/sqlite'
import type { ResolvedSqliteDb } from '../local-db.js'
import {
  BASELINE_PREFIX,
  FEATURE_LAYER,
  LAYERS,
  SEED_LAYER,
  copyName,
  keepMatcher,
  quoteIdentifier,
  type ScenarioBaseline,
  type ScenarioBaselineOptions,
} from '../scenario-baseline.js'

export async function captureSqliteScenarioBaseline(
  resolved: ResolvedSqliteDb,
  { keep = [] }: ScenarioBaselineOptions
): Promise<ScenarioBaseline> {
  const runtime = await loadSqliteRuntime()
  const shouldKeep = keepMatcher(keep)

  const withDb = <T>(run: (db: ReturnType<typeof runtime.open>) => T): T => {
    const db = runtime.open(resolved.dbFile)
    try {
      return run(db)
    } finally {
      db.close()
    }
  }

  const copy = (layer: string, table: string) =>
    quoteIdentifier(BASELINE_PREFIX + copyName([layer, table]))

  const tables = withDb((db) =>
    (
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
        )
        .all() as { name: string }[]
    )
      .map(({ name }) => name)
      .filter(
        (name) =>
          name !== MIGRATION_TRACKING_TABLE &&
          !name.startsWith(BASELINE_PREFIX) &&
          !shouldKeep(null, name)
      )
      .sort()
  )

  const captureLayer = (layer: string) =>
    withDb((db) => {
      for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${copy(layer, table)}`)
        db.exec(
          `CREATE TABLE ${copy(layer, table)} AS SELECT * FROM ${quoteIdentifier(table)}`
        )
      }
    })

  const restoreLayer = (layer: string) =>
    withDb((db) => {
      // Foreign keys are switched off for the duration rather than the tables
      // sorted into dependency order: `keep` can hold the parent of a table
      // being replaced, which no ordering makes legal. The pragma is a no-op
      // inside a transaction, so it goes before BEGIN.
      db.exec('PRAGMA foreign_keys = OFF')
      db.exec('BEGIN')
      try {
        for (const table of tables) {
          db.exec(`DELETE FROM ${quoteIdentifier(table)}`)
          db.exec(
            `INSERT INTO ${quoteIdentifier(table)} SELECT * FROM ${copy(layer, table)}`
          )
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      } finally {
        db.exec('PRAGMA foreign_keys = ON')
      }
    })

  captureLayer(SEED_LAYER)
  let active = SEED_LAYER

  return {
    tables,
    async restore() {
      restoreLayer(active)
    },
    async pushFeatureLayer() {
      captureLayer(FEATURE_LAYER)
      active = FEATURE_LAYER
    },
    async popFeatureLayer() {
      active = SEED_LAYER
    },
    async drop() {
      withDb((db) => {
        for (const layer of LAYERS) {
          for (const table of tables) {
            db.exec(`DROP TABLE IF EXISTS ${copy(layer, table)}`)
          }
        }
      })
    },
  }
}
