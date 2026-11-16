import { CLIError } from '@pikku/core/cli'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  resolveDb,
  generateMigrations,
  declaredSqliteConstraintNotice,
} from '../db/local-db.js'
import { SQLITE_UNENFORCED_RULE } from '../db/sqlite-constraint-notice.js'
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
        'pikku db generate: no database configured — set sqliteDb, postgresUrl or mysqlUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const state = await getInspectorState()
    const addons = [...state.rpc.wireAddonDeclarations.entries()].map(
      ([namespace, { package: pkg, remote, file, ui }]) => ({
        package: pkg,
        remote,
        file,
        name: namespace,
        ui,
      })
    )

    const { upToDate, written, refusals } = await generateMigrations(
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

    if (written.length === 0 && upToDate.length === 0 && !refusals.length) {
      logger.info('db generate: nothing declares tables — nothing to generate')
      return
    }

    for (const { source, file, needsBackfill, orphaned } of written) {
      logger.info(`db generate: wrote ${file} for ${source}`)
      for (const column of orphaned) {
        logger.warn(
          `  ${column} is required but ${source} no longer writes it — the migration drops or relaxes it so inserts stop failing.`
        )
      }
      for (const column of needsBackfill) {
        logger.warn(
          `  ${column} is NOT NULL with no default — decide what existing rows get before applying.`
        )
      }
    }
    if (written.length > 0) {
      logger.info('  Review them, then run `pikku db migrate` to apply.')
    }

    if (config.validate?.rules?.[SQLITE_UNENFORCED_RULE] !== 'off') {
      const notice = await declaredSqliteConstraintNotice(resolved)
      if (notice) logger.warn(`db generate: ${notice}`)
    }

    if (refusals.length > 0) {
      logger.error(
        'db generate: refused to write the migration for db/tables.ts:'
      )
      for (const refusal of refusals) logger.error(`  ${refusal}`)
      throw new CLIError('db generate refused')
    }
  },
})
