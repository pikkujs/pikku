import { pikkuSessionlessFunc } from '#pikku/function'
import { resolveDb, generateMigrations } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbGenerate = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config, getInspectorState }) => {
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
        'pikku db generate: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const state = await getInspectorState()
    const addons = [...state.rpc.wireAddonDeclarations.values()].map(
      ({ package: pkg, remote }) => ({ package: pkg, remote })
    )

    const { upToDate, written } = await generateMigrations(
      resolved,
      config.rootDir,
      config.srcDirectories,
      logger,
      addons,
      state.serviceAggregation.requiredServices
    )

    for (const source of upToDate) {
      logger.info(
        `db generate: ${source} is already covered by existing migrations`
      )
    }

    if (written.length === 0) {
      if (upToDate.length === 0) {
        logger.info(
          'db generate: nothing declares tables — nothing to generate'
        )
      }
      return
    }

    for (const { source, file, needsBackfill } of written) {
      logger.info(`db generate: wrote ${file} for ${source}`)
      for (const column of needsBackfill) {
        logger.warn(
          `  ${column} is NOT NULL with no default — decide what existing rows get before applying.`
        )
      }
    }
    logger.info('  Review them, then run `pikku db migrate` to apply.')
  },
})
