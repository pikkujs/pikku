import { MIGRATION_TRACKING_TABLE } from '@pikku/migrator-sql'
import { withPostgresClient, type ResolvedPostgresDb } from '../local-db.js'
import {
  BASELINE_SCHEMA,
  FEATURE_LAYER,
  SEED_LAYER,
  copyName,
  keepMatcher,
  quoteIdentifier,
  type ScenarioBaseline,
  type ScenarioBaselineOptions,
} from '../scenario-baseline.js'

interface PostgresSequence {
  qualified: string
  lastValue: string | null
  startValue: string
}

export async function capturePostgresScenarioBaseline(
  resolved: ResolvedPostgresDb,
  { keep = [] }: ScenarioBaselineOptions
): Promise<ScenarioBaseline> {
  const shouldKeep = keepMatcher(keep)
  const sequencesByLayer = new Map<string, PostgresSequence[]>()

  const copy = (layer: string, schema: string, table: string) =>
    `${quoteIdentifier(BASELINE_SCHEMA)}.${quoteIdentifier(copyName([layer, schema, table]))}`

  const tables = await withPostgresClient(resolved, async (client) => {
    const { rows } = await client.query<{
      table_schema: string
      table_name: string
    }>(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('information_schema', '${BASELINE_SCHEMA}')
        AND table_schema NOT LIKE 'pg_%'
      ORDER BY table_schema, table_name
    `)
    await client.query(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(BASELINE_SCHEMA)}`
    )
    return rows.filter(
      ({ table_schema, table_name }) =>
        table_name !== MIGRATION_TRACKING_TABLE &&
        !shouldKeep(table_schema, table_name)
    )
  })

  const captureLayer = (layer: string) =>
    withPostgresClient(resolved, async (client) => {
      for (const { table_schema, table_name } of tables) {
        const target = copy(layer, table_schema, table_name)
        await client.query(`DROP TABLE IF EXISTS ${target}`)
        await client.query(
          `CREATE TABLE ${target} AS TABLE ${quoteIdentifier(table_schema)}.${quoteIdentifier(table_name)}`
        )
      }

      // Sequences are state the row copies do not carry: restoring the rows
      // without them leaves the next insert claiming an id that already exists.
      const { rows } = await client.query<{
        schemaname: string
        sequencename: string
        last_value: string | null
        start_value: string
        owner_schema: string | null
        owner_table: string | null
      }>(`
        SELECT s.schemaname, s.sequencename, s.last_value, s.start_value,
               owner_ns.nspname AS owner_schema,
               owner_cls.relname AS owner_table
        FROM pg_sequences s
        JOIN pg_namespace seq_ns ON seq_ns.nspname = s.schemaname
        JOIN pg_class seq_cls
          ON seq_cls.relname = s.sequencename
         AND seq_cls.relnamespace = seq_ns.oid
        LEFT JOIN pg_depend dep
          ON dep.classid = 'pg_class'::regclass
         AND dep.objid = seq_cls.oid
         AND dep.refclassid = 'pg_class'::regclass
         AND dep.deptype IN ('a', 'i')
        LEFT JOIN pg_class owner_cls ON owner_cls.oid = dep.refobjid
        LEFT JOIN pg_namespace owner_ns ON owner_ns.oid = owner_cls.relnamespace
        WHERE s.schemaname NOT IN ('information_schema', '${BASELINE_SCHEMA}')
          AND s.schemaname NOT LIKE 'pg_%'
      `)
      sequencesByLayer.set(
        layer,
        rows
          // A sequence owned by a kept table is left alone with the table: its
          // rows survive the restore, so winding its counter back hands the
          // next insert an id that is already taken.
          .filter(
            (sequence) =>
              !(
                sequence.owner_table !== null &&
                shouldKeep(sequence.owner_schema, sequence.owner_table)
              )
          )
          .map((sequence) => ({
            qualified: `${quoteIdentifier(sequence.schemaname)}.${quoteIdentifier(sequence.sequencename)}`,
            lastValue: sequence.last_value,
            startValue: sequence.start_value,
          }))
      )
    })

  const restoreLayer = (layer: string) =>
    withPostgresClient(resolved, async (client) => {
      // Foreign keys are switched off for the duration rather than the tables
      // sorted into dependency order: `keep` can hold the parent of a table
      // being replaced, which no ordering makes legal.
      try {
        await client.query(`SET session_replication_role = 'replica'`)
      } catch (error: any) {
        throw new Error(
          `Scenario database reset needs 'SET session_replication_role' to suspend foreign keys, and this role may not: ${error?.message ?? error}. Connect as a superuser, or run the suite against sqlite.`
        )
      }
      try {
        await client.query('BEGIN')
        try {
          for (const { table_schema, table_name } of tables) {
            const target = `${quoteIdentifier(table_schema)}.${quoteIdentifier(table_name)}`
            await client.query(`DELETE FROM ${target}`)
            await client.query(
              `INSERT INTO ${target} SELECT * FROM ${copy(layer, table_schema, table_name)}`
            )
          }
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
        for (const { qualified, lastValue, startValue } of sequencesByLayer.get(
          layer
        ) ?? []) {
          await client.query(
            lastValue === null
              ? `SELECT setval('${qualified}', ${startValue}, false)`
              : `SELECT setval('${qualified}', ${lastValue}, true)`
          )
        }
      } finally {
        await client.query(`SET session_replication_role = 'origin'`)
      }
    })

  await captureLayer(SEED_LAYER)
  let active = SEED_LAYER

  return {
    tables: tables.map(
      ({ table_schema, table_name }) => `${table_schema}.${table_name}`
    ),
    restore: () => restoreLayer(active),
    async pushFeatureLayer() {
      await captureLayer(FEATURE_LAYER)
      active = FEATURE_LAYER
    },
    async popFeatureLayer() {
      active = SEED_LAYER
    },
    async drop() {
      await withPostgresClient(resolved, async (client) => {
        await client.query(
          `DROP SCHEMA IF EXISTS ${quoteIdentifier(BASELINE_SCHEMA)} CASCADE`
        )
      })
    },
  }
}
