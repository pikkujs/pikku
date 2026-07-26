import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb, computeSchemaDrift } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

/**
 * Report how the configured database differs from the schema its migrations
 * define.
 *
 * Answers the question nobody can otherwise answer without going and looking by
 * hand: does this database still match what we wrote down? Missing tables and
 * columns fail the command — the database is behind and a migration has not
 * been applied. Tables the migrations never mention are reported but never
 * fail: something created them outside the migration history, which is worth
 * seeing but is not this command's to fix.
 */
export const dbCheck = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveDb(
      userConfig,
      config.rootDir,
      config.outDir,
      config.runtimeDir
    )
    if (!resolved) {
      logger.error(
        'pikku db check: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const drift = await computeSchemaDrift(resolved)

    // Table names elide the `public` schema, which reads as ambiguous in a
    // report whose whole point can be a second copy of `app.orders` sitting in
    // `public`. Put the schema back for display only.
    const qualify = (table: string) =>
      resolved.dialect === 'postgres' && !table.includes('.')
        ? `public.${table}`
        : table

    if (drift.extraTables.length) {
      logger.info(
        `db check: ${drift.extraTables.length} table(s) in the database that no migration creates:`
      )
      for (const table of drift.extraTables) {
        logger.info(`  ${qualify(table)}`)
      }
      logger.info(
        '  Left alone — a migration cannot know whether these hold data worth keeping.'
      )
    }

    if (drift.inSync) {
      logger.info('db check: the database matches its migrations')
      return
    }

    logger.error('db check: the database is behind its migrations:')
    if (drift.missingTables.length) {
      logger.error(
        `  missing tables: ${drift.missingTables.map(qualify).join(', ')}`
      )
    }
    for (const { table, columns } of drift.missingColumns) {
      logger.error(`  ${qualify(table)} missing columns: ${columns.join(', ')}`)
    }
    logger.error('  Run `pikku db migrate` to apply them.')
    throw new Error('database schema is behind its migrations')
  },
})
