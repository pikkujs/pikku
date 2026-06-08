import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'
import type { ClassificationManifest } from '@pikku/core'

export const dbAudit = pikkuSessionlessFunc<{}, void>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveDb(userConfig, config.rootDir, config.outDir, config.runtimeDir)
    if (!resolved) {
      logger.error(
        'pikku db audit: no database configured — set sqliteDb or postgresUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    let manifest: ClassificationManifest
    try {
      const mod = await import(resolved.manifestFile)
      manifest = mod.classificationManifest as ClassificationManifest
    } catch {
      logger.error(
        `pikku db audit: classification manifest not found at ${resolved.manifestFile}.\n` +
          `  Run \`pikku db migrate\` to generate it.`
      )
      throw new Error('classification manifest not found')
    }

    let publicCount = 0
    let privateCount = 0
    let secretCount = 0
    const noStrategyColumns: string[] = []
    const secretColumns: string[] = []

    logger.info('Classification audit:')

    for (const [table, cols] of Object.entries(manifest.tables)) {
      logger.info(`  ${table}:`)
      for (const [col, info] of Object.entries(cols)) {
        const { classification, anonymize_strategy } = info
        const strategyLabel =
          anonymize_strategy ?? '(null → will be nulled on clone)'

        if (classification === 'public') {
          publicCount++
          logger.info(`    ${col.padEnd(30)} public`)
        } else if (classification === 'secret') {
          secretCount++
          secretColumns.push(`${table}.${col}`)
          if (!anonymize_strategy) noStrategyColumns.push(`${table}.${col}`)
          logger.info(`    ${col.padEnd(30)} secret   ${strategyLabel}`)
        } else {
          privateCount++
          if (!anonymize_strategy) noStrategyColumns.push(`${table}.${col}`)
          logger.info(`    ${col.padEnd(30)} private  ${strategyLabel}`)
        }
      }
    }

    const total = publicCount + privateCount + secretCount
    logger.info('')
    logger.info(
      `Summary: ${total} columns total — ` +
        `${publicCount} public, ${privateCount} private, ${secretCount} secret`
    )

    if (secretColumns.length > 0) {
      logger.info(
        `Secret columns (extra-sensitive): ${secretColumns.join(', ')}`
      )
    }

    if (noStrategyColumns.length > 0) {
      logger.warn(
        `${noStrategyColumns.length} private/secret column(s) have no anonymize strategy ` +
          `and will be NULLed on clone: ${noStrategyColumns.join(', ')}`
      )
    }
  },
})
