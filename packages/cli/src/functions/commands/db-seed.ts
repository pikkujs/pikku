import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb, seed } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbSeed = pikkuSessionlessFunc<{}, void>({
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
        'pikku db seed: no database configured — set sqliteDb in your createConfig.'
      )
      throw new Error('no database configured')
    }

    if (resolved.dialect !== 'sqlite') {
      logger.error(
        'pikku db seed: seed is only supported for SQLite databases.'
      )
      throw new Error('seed not supported for postgres')
    }

    const result = await seed(resolved)
    if (!result.applied) {
      logger.info(`db seed: no ${resolved.seedFile} found, nothing to do`)
    } else {
      logger.info(
        `db seed: applied ${resolved.seedFile} (${result.bytes} bytes)`
      )
    }
  },
})
