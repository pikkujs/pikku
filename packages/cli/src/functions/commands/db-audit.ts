import chalk from 'chalk'
import { pikkuSessionlessFunc } from '#pikku'
import { resolveDb } from '../db/local-db.js'
import { loadUserConfigForDb } from './db-shared.js'
import type { ClassificationManifest, Classification, AnonymizeStrategy } from '@pikku/core'

export interface AuditColumn {
  name: string
  classification: Classification
  anonymize_strategy: AnonymizeStrategy
}

export interface AuditTable {
  name: string
  columns: AuditColumn[]
}

export interface DbAuditResult {
  tables: AuditTable[]
  summary: {
    total: number
    public: number
    private: number
    secret: number
    encrypted: number
  }
  noStrategyColumns: string[]
  secretColumns: string[]
  encryptedColumns: string[]
}

const CLASSIFICATION_COLORS: Record<Classification, (s: string) => string> = {
  public: chalk.green,
  private: chalk.blue,
  secret: chalk.red,
  encrypted: chalk.cyan,
}

export const renderDbAudit = (_s: unknown, result: DbAuditResult): void => {
  for (const table of result.tables) {
    console.log(chalk.bold(`  ${table.name}:`))
    for (const col of table.columns) {
      const color = CLASSIFICATION_COLORS[col.classification]
      const label = color(col.classification.padEnd(10))
      const strategy = col.anonymize_strategy
        ? chalk.dim(col.anonymize_strategy)
        : col.classification === 'encrypted'
          ? ''
          : chalk.dim('(null → will be nulled on clone)')
      console.log(`    ${col.name.padEnd(30)} ${label} ${strategy}`)
    }
  }

  const { total, public: pub, private: priv, secret, encrypted } = result.summary
  console.log('')
  console.log(
    chalk.bold('Summary: ') +
      `${total} columns total — ` +
      chalk.green(`${pub} public`) + ', ' +
      chalk.blue(`${priv} private`) + ', ' +
      chalk.red(`${secret} secret`) + ', ' +
      chalk.cyan(`${encrypted} encrypted`)
  )

  if (result.secretColumns.length > 0) {
    console.log(chalk.red(`Secret columns (extra-sensitive): ${result.secretColumns.join(', ')}`))
  }

  if (result.encryptedColumns.length > 0) {
    console.log(chalk.cyan(`Encrypted columns (encrypted at rest): ${result.encryptedColumns.join(', ')}`))
  }

  if (result.noStrategyColumns.length > 0) {
    console.error(
      chalk.yellow(
        `⚠  ${result.noStrategyColumns.length} private/secret column(s) have no anonymize strategy ` +
          `and will be NULLed on clone: ${result.noStrategyColumns.join(', ')}`
      )
    )
  }
}

export const dbAudit = pikkuSessionlessFunc<{}, DbAuditResult>({
  remote: true,
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) throw new Error('no user config')

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

    const tables: AuditTable[] = []
    const noStrategyColumns: string[] = []
    const secretColumns: string[] = []
    const encryptedColumns: string[] = []
    const summary = { total: 0, public: 0, private: 0, secret: 0, encrypted: 0 }

    for (const [tableName, cols] of Object.entries(manifest.tables)) {
      const columns: AuditColumn[] = []
      for (const [colName, info] of Object.entries(cols)) {
        const { classification, anonymize_strategy } = info
        columns.push({ name: colName, classification, anonymize_strategy })
        summary.total++
        summary[classification]++

        if (classification === 'secret') {
          secretColumns.push(`${tableName}.${colName}`)
          if (!anonymize_strategy) noStrategyColumns.push(`${tableName}.${colName}`)
        } else if (classification === 'encrypted') {
          encryptedColumns.push(`${tableName}.${colName}`)
        } else if (classification === 'private') {
          if (!anonymize_strategy) noStrategyColumns.push(`${tableName}.${colName}`)
        }
      }
      tables.push({ name: tableName, columns })
    }

    return { tables, summary, noStrategyColumns, secretColumns, encryptedColumns }
  },
})
