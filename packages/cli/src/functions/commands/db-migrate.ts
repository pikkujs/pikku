import { pikkuSessionlessFunc } from '#pikku'
import { resolveLocalDb, migrateAndCodegen } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbMigrate = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config, getInspectorState }) => {
    const userConfig = await loadUserConfigForDb({
      config,
      getInspectorState,
      logger,
    })
    if (!userConfig) return

    const resolved = resolveLocalDb(userConfig.dev?.localDb, config.rootDir)
    if (!resolved) {
      logger.error(
        'pikku db migrate: dev.localDb is not configured in your pikku config.'
      )
      throw new Error('dev.localDb not configured')
    }

    const { migrate, codegen } = migrateAndCodegen(resolved)

    if (migrate.applied.length === 0) {
      logger.info(
        `db migrate: no pending migrations (${migrate.skipped.length} already applied)`
      )
    } else {
      for (const name of migrate.applied) {
        logger.info(`db migrate: applied ${name}`)
      }
    }
    logger.info(
      codegen.written
        ? `db migrate: regenerated ${codegen.outFile} (${codegen.tables.length} tables)`
        : `db migrate: ${codegen.outFile} unchanged`
    )
  },
})
