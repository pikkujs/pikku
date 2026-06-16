import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb, generateAuthMigration } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbGenerate = pikkuSessionlessFunc<{}, void>({
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
        'pikku db generate: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const result = await generateAuthMigration(
      resolved,
      config.rootDir,
      config.srcDirectories,
      logger
    )

    switch (result.status) {
      case 'no-auth':
        logger.info('db generate: no pikkuBetterAuth found — nothing to generate')
        return
      case 'up-to-date':
        logger.info(
          'db generate: Better Auth schema already covered by existing migrations — nothing to generate'
        )
        return
      case 'unsupported-dialect':
        logger.warn(
          'db generate: automatic Better Auth migration generation is currently SQLite-only. Run Better Auth schema generation manually for postgres.'
        )
        return
      case 'incremental-unsupported': {
        const cols = (result.missingColumns ?? [])
          .map((m) => `${m.table}(${m.columns.join(', ')})`)
          .join('; ')
        logger.error(
          'db generate: the Better Auth config requires schema changes on top of an existing auth schema:'
        )
        if (result.missingTables?.length) {
          logger.error(`  missing tables: ${result.missingTables.join(', ')}`)
        }
        if (cols) logger.error(`  missing columns: ${cols}`)
        logger.error(
          '  Write a forward migration adding these by hand (incremental auto-generation is not yet supported).'
        )
        throw new Error(
          'incremental auth schema change requires a manual migration'
        )
      }
      case 'written':
        logger.info(`db generate: wrote ${result.file}`)
        logger.info('  Review it, then run `pikku db migrate` to apply.')
        return
    }
  },
})
