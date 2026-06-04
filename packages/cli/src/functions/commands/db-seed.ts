import { pikkuSessionlessFunc } from '#pikku'
import { resolveLocalDb, seed } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbSeed = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({
      config,
      logger,
    })
    if (!userConfig) return

    const resolved = resolveLocalDb(
      userConfig.dev?.db,
      config.rootDir,
      config.outDir,
      config.runtimeDir
    )
    if (!resolved) {
      logger.error(
        'pikku db seed: dev.db is not configured in your pikku config.'
      )
      throw new Error('dev.db not configured')
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
