import { pikkuSessionlessFunc } from '#pikku/function'
import { resolveDb, migrateAndCodegen } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

/**
 * Regenerate the database types from the migration files alone, without
 * connecting to the configured database.
 *
 * `db migrate` can only emit types after it has migrated the real database,
 * which forces codegen to run late — after a deploy has already moved the
 * schema. This command applies the same migrations to a throwaway database and
 * introspects that, so `pikku all` can be given an accurate table zod on a
 * machine with no database reachable at all.
 */
export const dbCodegen = pikkuSessionlessFunc<{}, void>({
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
        'pikku db codegen: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const { migrate, codegen, zod } = await migrateAndCodegen(resolved, {
      scratch: true,
    })

    for (const warning of codegen.warnings) {
      logger.diagnostic(warning)
    }

    logger.info(
      `db codegen: applied ${migrate.applied.length} migration(s) to a scratch ${resolved.dialect} database`
    )
    logger.info(
      codegen.written
        ? `db codegen: regenerated ${codegen.outFile} (${codegen.tables.length} tables)`
        : `db codegen: ${codegen.outFile} unchanged`
    )
    logger.info(
      zod.written
        ? `db codegen: regenerated ${zod.outFile} (${zod.tables.length} tables)`
        : `db codegen: ${zod.outFile} unchanged`
    )
  },
})
