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
        'pikku db seed: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const result = await seed(resolved)
    const seedFile = resolved.seedFile
    if (!result.applied) {
      logger.info(`db seed: no ${seedFile} found, nothing to do`)
    } else {
      logger.info(`db seed: applied ${seedFile} (${result.bytes} bytes)`)
    }
  },
})
