import { pikkuSessionlessFunc } from '#pikku'
import {
  resolveLocalDb,
  reset,
  migrateAndCodegen,
  seed,
} from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbReset = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({
      config,
      logger,
    })
    if (!userConfig) return

    const resolved = resolveLocalDb(
      userConfig.sqliteDb,
      config.rootDir,
      config.outDir,
      config.runtimeDir
    )
    if (!resolved) {
      logger.error(
        'pikku db reset: sqliteDb is not configured in your createConfig.'
      )
      throw new Error('sqliteDb not configured')
    }

    reset(resolved, config.rootDir)
    logger.info(`db reset: removed ${resolved.dbFile}`)

    const { migrate, codegen, zod } = await migrateAndCodegen(resolved)
    for (const name of migrate.applied) {
      logger.info(`db reset: applied ${name}`)
    }
    logger.info(
      codegen.written
        ? `db reset: regenerated ${codegen.outFile} (${codegen.tables.length} tables)`
        : `db reset: ${codegen.outFile} unchanged`
    )
    logger.info(
      zod.written
        ? `db reset: regenerated ${zod.outFile} (${zod.tables.length} tables)`
        : `db reset: ${zod.outFile} unchanged`
    )

    const seedResult = await seed(resolved)
    if (seedResult.applied) {
      logger.info(
        `db reset: seeded ${resolved.seedFile} (${seedResult.bytes} bytes)`
      )
    }
  },
})
