import chalk from 'chalk'
import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb, migrateAndCodegen } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

export interface DbMigrateResult {
  appliedMigrations: string[]
  skippedCount: number
  schema: { updated: boolean; file: string; tableCount: number }
  zod: { updated: boolean; file: string; tableCount: number }
}

export const renderDbMigrate = (_s: unknown, result: DbMigrateResult): void => {
  if (result.appliedMigrations.length === 0) {
    console.log(
      chalk.dim(`db migrate: no pending migrations (${result.skippedCount} already applied)`)
    )
  } else {
    for (const name of result.appliedMigrations) {
      console.log(chalk.green(`✓  applied  `) + name)
    }
  }

  const schemaLine = result.schema.updated
    ? chalk.green(`✓  regenerated`) + ` ${result.schema.file} (${result.schema.tableCount} tables)`
    : chalk.dim(`   unchanged  ${result.schema.file}`)
  console.log(schemaLine)

  const zodLine = result.zod.updated
    ? chalk.green(`✓  regenerated`) + ` ${result.zod.file} (${result.zod.tableCount} tables)`
    : chalk.dim(`   unchanged  ${result.zod.file}`)
  console.log(zodLine)
}

export const dbMigrate = pikkuSessionlessFunc<{}, DbMigrateResult>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) throw new Error('no user config')

    const resolved = resolveDb(userConfig, config.rootDir, config.outDir, config.runtimeDir)
    if (!resolved) {
      logger.error(
        'pikku db migrate: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const { migrate, codegen, zod } = await migrateAndCodegen(resolved)

    return {
      appliedMigrations: migrate.applied,
      skippedCount: migrate.skipped.length,
      schema: { updated: codegen.written, file: codegen.outFile, tableCount: codegen.tables.length },
      zod: { updated: zod.written, file: zod.outFile, tableCount: zod.tables.length },
    }
  },
})
