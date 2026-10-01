import { MIGRATION_TRACKING_TABLE } from '@pikku/migrator-sql'
import type { ResolvedMysqlDb } from '../local-db.js'
import { withMysqlClient } from './mysql-client.js'
import {
  BASELINE_SCHEMA,
  FEATURE_LAYER,
  SEED_LAYER,
  copyName,
  keepMatcher,
  type ScenarioBaseline,
  type ScenarioBaselineOptions,
} from '../scenario-baseline.js'

const quote = (name: string) => `\`${name.replace(/`/g, '``')}\``

/**
 * MySQL's version of the baseline: the copies live in a database of their own
 * beside the one under test, which is what MySQL calls the schema Postgres
 * parks them in. Needs `CREATE` on databases for the same reason a scratch
 * database does.
 *
 * `AUTO_INCREMENT` is the sequence state. A copy made with `CREATE TABLE … LIKE`
 * keeps the column but not the counter, so each table's next value is read at
 * capture time and written back on restore — otherwise the next insert after a
 * restore claims an id the restored rows already hold.
 */
export async function captureMysqlScenarioBaseline(
  resolved: ResolvedMysqlDb,
  { keep = [] }: ScenarioBaselineOptions
): Promise<ScenarioBaseline> {
  const shouldKeep = keepMatcher(keep)
  const autoIncrementByLayer = new Map<string, Map<string, number>>()

  const copy = (layer: string, table: string) =>
    `${quote(BASELINE_SCHEMA)}.${quote(copyName([layer, table]))}`

  const tables = await withMysqlClient(resolved, async (client) => {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name AS table_name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
    await client.exec(`CREATE DATABASE IF NOT EXISTS ${quote(BASELINE_SCHEMA)}`)
    return rows
      .map((r) => r.table_name)
      .filter(
        (name) => name !== MIGRATION_TRACKING_TABLE && !shouldKeep(null, name)
      )
  })

  const captureLayer = (layer: string) =>
    withMysqlClient(resolved, async (client) => {
      const counters = new Map<string, number>()
      for (const table of tables) {
        const target = copy(layer, table)
        await client.exec(`DROP TABLE IF EXISTS ${target}`)
        await client.exec(`CREATE TABLE ${target} LIKE ${quote(table)}`)
        await client.exec(`INSERT INTO ${target} SELECT * FROM ${quote(table)}`)
      }
      const { rows } = await client.query<{
        table_name: string
        auto_increment: string | number | null
      }>(
        `SELECT table_name AS table_name, auto_increment AS auto_increment
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND auto_increment IS NOT NULL`
      )
      for (const row of rows) {
        if (tables.includes(row.table_name)) {
          counters.set(row.table_name, Number(row.auto_increment))
        }
      }
      autoIncrementByLayer.set(layer, counters)
    })

  const restoreLayer = (layer: string) =>
    withMysqlClient(resolved, async (client) => {
      // Foreign keys are suspended for the replace rather than the tables
      // ordered by dependency: `keep` can hold the parent of a table being
      // replaced, which no ordering makes legal. Session-scoped, which is why
      // the client is one connection and not a pool.
      await client.exec('SET FOREIGN_KEY_CHECKS = 0')
      try {
        for (const table of tables) {
          await client.exec(`DELETE FROM ${quote(table)}`)
          await client.exec(
            `INSERT INTO ${quote(table)} SELECT * FROM ${copy(layer, table)}`
          )
        }
        for (const [table, next] of autoIncrementByLayer.get(layer) ?? []) {
          await client.exec(
            `ALTER TABLE ${quote(table)} AUTO_INCREMENT = ${next}`
          )
        }
      } finally {
        await client.exec('SET FOREIGN_KEY_CHECKS = 1')
      }
    })

  await captureLayer(SEED_LAYER)
  let active = SEED_LAYER

  return {
    tables,
    restore: () => restoreLayer(active),
    async pushFeatureLayer() {
      await captureLayer(FEATURE_LAYER)
      active = FEATURE_LAYER
    },
    async popFeatureLayer() {
      active = SEED_LAYER
    },
    async drop() {
      await withMysqlClient(resolved, async (client) => {
        await client.exec(`DROP DATABASE IF EXISTS ${quote(BASELINE_SCHEMA)}`)
      })
    },
  }
}
