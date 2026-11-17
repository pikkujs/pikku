import { CLIError } from '@pikku/core/cli'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  assertLocalDatabase,
  resolveDb,
  migrateAndCodegen,
  computeAuthDrift,
  computeDeclaredTablesDrift,
} from '../db/local-db.js'
import { wiredAddons } from '../db/addon-declarations.js'
import { loadUserConfigForDb } from './db-shared.js'

export const dbMigrate = pikkuSessionlessFunc<
  { localOnly?: boolean; allowDestructive?: boolean },
  void
>({
  remote: true,
  func: async ({ logger, config, getInspectorState }, data) => {
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
        'pikku db migrate: no database configured — set sqliteDb, postgresUrl or mysqlUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    if (data?.localOnly) assertLocalDatabase(resolved)

    const addons = wiredAddons(await getInspectorState())
    const { migrate, codegen, zod } = await migrateAndCodegen(resolved, {
      allowDestructive: data?.allowDestructive,
      addons,
    })

    for (const warning of codegen.warnings) {
      logger.diagnostic(warning)
    }

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

    const drift = await computeAuthDrift(
      resolved,
      config.rootDir,
      config.sourceDirs,
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

    const declared = await computeDeclaredTablesDrift(resolved, addons)
    if (declared.pending || declared.refusals.length > 0) {
      logger.error('db migrate: the migrations do not cover db/tables.ts:')
      for (const refusal of declared.refusals) logger.error(`  ${refusal}`)
      for (const change of declared.destructive) logger.error(`  ${change}`)
      if (declared.pending) {
        logger.error(
          declared.destructive.length > 0
            ? '  Run `pikku db generate --allowDestructive` to write them, then re-run.'
            : '  Run `pikku db generate` to write them, then re-run.'
        )
      }
      throw new CLIError('db/tables.ts is ahead of the migrations')
    }
  },
})
