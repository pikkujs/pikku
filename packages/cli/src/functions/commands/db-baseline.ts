import { pikkuSessionlessFunc } from '#pikku/function'
import { resolveDb, baseline } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

/**
 * Record the pending migrations as applied, without running them.
 *
 * For a database that already contains what they describe. The case it exists
 * for is a schema that was created at boot and written down afterwards: every
 * deployment already has those tables, so applying the migration fails, and
 * leaving it pending forever means the history never catches up with reality.
 *
 * Refuses unless the database really is up to date, because that is the entire
 * premise. A database that is behind gets the same report `db check` gives —
 * baselining it would bury a real gap under a history claiming otherwise.
 */
export const dbBaseline = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveDb(
      userConfig,
      config.rootDir,
      config.outDir,
      config.runtimeDir,
      config.db
    )
    if (!resolved) {
      logger.error(
        'pikku db baseline: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const result = await baseline(
      resolved,
      config.rootDir,
      config.srcDirectories,
      logger
    )

    if (result.status === 'behind') {
      logger.error(
        'db baseline: refused — the database does not yet contain everything the migrations describe:'
      )
      if (result.drift.missingTables.length) {
        logger.error(
          `  missing tables: ${result.drift.missingTables.join(', ')}`
        )
      }
      for (const { table, columns } of result.drift.missingColumns) {
        logger.error(`  ${table} missing columns: ${columns.join(', ')}`)
      }
      logger.error(
        '  Baselining now would record migrations that never ran. Run `pikku db migrate` instead.'
      )
      throw new Error('database is behind its migrations')
    }

    if (result.recorded.length === 0) {
      logger.info('db baseline: nothing pending — every migration is recorded')
      return
    }

    logger.info(
      `db baseline: recorded ${result.recorded.length} migration(s) as applied without running them:`
    )
    for (const name of result.recorded) {
      logger.info(`  ${name}`)
    }
  },
})
