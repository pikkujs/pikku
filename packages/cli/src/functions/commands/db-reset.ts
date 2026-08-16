import { pikkuSessionlessFunc } from '#pikku/function'
import { resolveDb, reset, migrateAndCodegen, devSeed } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'

/**
 * Wipe the dev database, replay every migration, then apply the dev seed.
 *
 * Seeding lives here rather than in a command of its own so it only ever meets
 * a freshly migrated, empty database. That is what lets a seed file be plain
 * `INSERT`s: there is no path that applies it twice, so it never has to defend
 * itself with `INSERT OR IGNORE` or `ON CONFLICT DO NOTHING`.
 */
export const dbReset = pikkuSessionlessFunc<{ noSeed?: boolean }, void>({
  remote: true,
  func: async ({ logger, config }, { noSeed }) => {
    if (process.env.NODE_ENV === 'production') {
      logger.error(
        'pikku db reset refused: NODE_ENV=production. This command only runs in dev.'
      )
      throw new Error('pikku db reset refused: NODE_ENV=production')
    }

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
        'pikku db reset: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    await reset(resolved, config.rootDir)
    logger.info(
      resolved.dialect === 'sqlite'
        ? `db reset: removed ${resolved.dbFile}`
        : resolved.mode === 'pglite'
          ? `db reset: removed ${resolved.pgliteDir}`
          : 'db reset: cleared non-system Postgres schemas'
    )

    const { migrate, codegen, zod } = await migrateAndCodegen(resolved)
    for (const warning of codegen.warnings) {
      logger.diagnostic(warning)
    }
    for (const name of migrate.applied) {
      logger.info(`db reset: applied ${name}`)
    }
    logger.info(
      codegen.written
        ? `db reset: regenerated ${codegen.outFile} (${codegen.tables.length} tables)`
        : `db reset: ${codegen.outFile} unchanged`
    )
    logger.info(
      zod.written
        ? `db reset: regenerated ${zod.outFile} (${zod.tables.length} tables)`
        : `db reset: ${zod.outFile} unchanged`
    )

    if (noSeed) {
      logger.info('db reset: --no-seed, leaving the database empty')
      return
    }

    const devSeedResult = await devSeed(resolved)
    logger.info(
      devSeedResult.applied
        ? `db reset: seeded ${resolved.devSeedFile} (${devSeedResult.bytes} bytes)`
        : `db reset: no ${resolved.devSeedFile} found, database is empty`
    )
  },
})
