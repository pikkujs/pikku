import { pikkuSessionlessFunc } from '#pikku'
import {
  resolveDb,
  migrateAndCodegen,
  computeAuthDrift,
} from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbMigrate = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveDb(userConfig, config.rootDir, config.outDir, config.runtimeDir)
    if (!resolved) {
      logger.error(
        'pikku db migrate: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const { migrate, codegen, zod } = await migrateAndCodegen(resolved)

    if (migrate.applied.length === 0) {
      logger.info(
        `db migrate: no pending migrations (${migrate.skipped.length} already applied)`
      )
    } else {
      for (const name of migrate.applied) {
        logger.info(`db migrate: applied ${name}`)
      }
    }
    logger.info(
      codegen.written
        ? `db migrate: regenerated ${codegen.outFile} (${codegen.tables.length} tables)`
        : `db migrate: ${codegen.outFile} unchanged`
    )
    logger.info(
      zod.written
        ? `db migrate: regenerated ${zod.outFile} (${zod.tables.length} tables)`
        : `db migrate: ${zod.outFile} unchanged`
    )

    // Drift guard: the Better Auth schema is owned by defineAuth, not the
    // migration files. If the applied migrations don't satisfy what Better Auth
    // requires, fail loudly pointing at `pikku db generate` rather than letting a
    // half-migrated auth schema reach runtime (where signUp would 500).
    const drift = await computeAuthDrift(
      resolved,
      config.rootDir,
      config.srcDirectories,
      logger
    )
    if (drift.hasAuth && !drift.inSync) {
      logger.error(
        'db migrate: the Better Auth schema is not satisfied by the applied migrations:'
      )
      if (drift.missingTables.length) {
        logger.error(`  missing tables: ${drift.missingTables.join(', ')}`)
      }
      for (const { table, columns } of drift.missingColumns) {
        logger.error(`  ${table} missing columns: ${columns.join(', ')}`)
      }
      logger.error(
        '  Run `pikku db generate` to create the missing migration, then re-run.'
      )
      throw new Error('Better Auth schema drift — run `pikku db generate`')
    }
  },
})
