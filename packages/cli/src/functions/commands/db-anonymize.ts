import { pikkuSessionlessFunc } from '#pikku'
import { resolve } from 'node:path'
import { resolveLocalDb } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'
import { anonymizeFile } from '../db/anonymize.js'
import type { ClassificationManifest } from '@pikku/core'

interface DbAnonymizeInput {
  in?: string
  out?: string
}

export const dbAnonymize = pikkuSessionlessFunc<DbAnonymizeInput, void>({
  remote: true,
  func: async ({ logger, config }, data) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveLocalDb(
      userConfig.sqliteDb,
      config.rootDir,
      config.outDir,
      config.runtimeDir
    )
    if (!resolved) {
      logger.error(
        'pikku db anonymize: sqliteDb is not configured in your createConfig.'
      )
      throw new Error('sqliteDb not configured')
    }

    // Resolve --in and --out with sensible defaults
    const inFile = data?.in ? resolve(config.rootDir, data.in) : resolved.dbFile
    const outFile = data?.out
      ? resolve(config.rootDir, data.out)
      : inFile.replace(/\.db$/, '.anonymized.db')

    if (inFile === outFile) {
      logger.error(
        'pikku db anonymize: --in and --out must be different files to avoid overwriting the source.'
      )
      throw new Error('--in and --out must differ')
    }

    let manifest: ClassificationManifest
    try {
      const mod = await import(resolved.manifestFile)
      manifest = mod.classificationManifest as ClassificationManifest
    } catch {
      logger.error(
        `pikku db anonymize: classification manifest not found at ${resolved.manifestFile}.\n` +
          `  Run \`pikku db migrate\` to generate it.`
      )
      throw new Error('classification manifest not found')
    }

    logger.info(`Anonymizing ${inFile} → ${outFile}`)

    const result = await anonymizeFile({
      inFile,
      outFile,
      manifest,
      logger,
    })

    logger.info(
      `Done: ${result.rowsProcessed} rows across ${result.tables.length} table(s) anonymized`
    )
  },
})
