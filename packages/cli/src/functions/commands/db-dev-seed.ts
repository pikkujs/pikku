import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb, devSeed } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbDevSeed = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    if (process.env.NODE_ENV === 'production') {
      logger.error(
        'pikku db dev-seed refused: NODE_ENV=production. Seed data is test data — this command only runs in dev.'
      )
      throw new Error('pikku db dev-seed refused: NODE_ENV=production')
    }

    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveDb(
      userConfig,
      config.rootDir,
      config.outDir,
      config.runtimeDir,
      config.db?.schema
    )
    if (!resolved) {
      logger.error(
        'pikku db dev-seed: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const result = await devSeed(resolved)
    const devSeedFile = resolved.devSeedFile
    if (!result.applied) {
      logger.info(`db dev-seed: no ${devSeedFile} found, nothing to do`)
    } else {
      logger.info(`db dev-seed: applied ${devSeedFile} (${result.bytes} bytes)`)
    }
  },
})
