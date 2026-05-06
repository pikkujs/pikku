import { pikkuSessionlessFunc } from '#pikku'
import { resolveLocalDb, seed } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbSeed = pikkuSessionlessFunc<{}, void>({
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
        'pikku db seed: dev.localDb is not configured in your pikku config.'
      )
      throw new Error('dev.localDb not configured')
    }

    const result = seed(resolved)
    if (!result.applied) {
      logger.info(`db seed: no ${resolved.seedFile} found, nothing to do`)
    } else {
      logger.info(
        `db seed: applied ${resolved.seedFile} (${result.bytes} bytes)`
      )
    }
  },
})
