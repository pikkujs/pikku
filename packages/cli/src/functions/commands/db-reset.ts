import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb, reset, migrateAndCodegen, seed } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbReset = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveDb(userConfig, config.rootDir, config.outDir, config.runtimeDir)
    if (!resolved) {
      logger.error(
        'pikku db reset: no database configured — set sqliteDb in your createConfig.'
      )
      throw new Error('no database configured')
    }

    if (resolved.dialect !== 'sqlite') {
      logger.error('pikku db reset: reset is only supported for SQLite databases.')
      throw new Error('reset not supported for postgres')
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
      logger.info(`db reset: seeded ${resolved.seedFile} (${seedResult.bytes} bytes)`)
    }
  },
})
