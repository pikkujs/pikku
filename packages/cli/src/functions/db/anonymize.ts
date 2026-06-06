import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ClassificationManifest, AnonymizeStrategy } from '@pikku/core'
import type { SyncSqliteDatabase } from './sqlite-runtime.js'
import { loadSqliteRuntime } from './sqlite-runtime.js'

// ─── Value faker ─────────────────────────────────────────────────────────────

function applyStrategy(
  value: unknown,
  strategy: AnonymizeStrategy,
  salt: string
): unknown {
  if (value === null || value === undefined) return null
  switch (strategy) {
    case null:
      return null
    case 'keep':
      return value
    case 'fake:email':
      return `anon_${randomBytes(4).toString('hex')}@example.com`
    case 'fake:name':
      return `Anon_${randomBytes(4).toString('hex')}`
    case 'hash':
      return createHash('sha256').update(salt + String(value)).digest('hex').slice(0, 32)
  }
}

// ─── Schema introspection ────────────────────────────────────────────────────

interface ColInfo {
  name: string
  notnull: number
  pk: number
}

function getTableColInfo(db: SyncSqliteDatabase, table: string): ColInfo[] {
  return db
    .prepare(`PRAGMA table_info("${table}")`)
    .all() as ColInfo[]
}

// ─── Core anonymizer ─────────────────────────────────────────────────────────

export interface AnonymizeResult {
  tables: string[]
  rowsProcessed: number
}

export interface AnonymizeLogger {
  info(msg: string): void
  warn(msg: string): void
}

/**
 * Anonymizes an open SQLite database in-place according to the classification
 * manifest.  Columns classified `public` or with strategy `keep` are left
 * untouched.  All other `private`/`secret` columns are replaced:
 *
 *   null strategy  → NULL  (skipped for PRIMARY KEY or NOT NULL columns)
 *   fake:email     → anon_<random>@example.com
 *   fake:name      → Anon_<random>
 *   hash           → SHA-256(salt + original)[:32] — deterministic within the run
 */
export function anonymizeDb(
  db: SyncSqliteDatabase,
  manifest: ClassificationManifest,
  logger: AnonymizeLogger
): AnonymizeResult {
  const salt = randomBytes(16).toString('hex')
  let totalRows = 0
  const processedTables: string[] = []

  for (const [table, cols] of Object.entries(manifest.tables)) {
    // Introspect actual schema to know PK / NOT NULL constraints
    const colInfoMap = new Map(
      getTableColInfo(db, table).map((c) => [c.name, c])
    )

    const targets = Object.entries(cols).filter(([col, info]) => {
      if (info.classification === 'public') return false
      if (info.anonymize_strategy === 'keep') return false
      const colMeta = colInfoMap.get(col)
      if (!colMeta) return false
      // Skip primary key columns — they're identity, not PII data
      if (colMeta.pk > 0) return false
      // Skip NOT NULL columns when strategy would produce NULL (avoids constraint violation)
      if (info.anonymize_strategy === null && colMeta.notnull) {
        logger.warn(
          `  ${table}.${col}: skipped — column is NOT NULL but has no anonymize strategy (add @private:keep, @private:fake:email etc. to the SQL comment)`
        )
        return false
      }
      return true
    })

    if (targets.length === 0) continue

    // Use _rid_ alias so the rowid column never clashes with an INTEGER PRIMARY KEY column
    // (when a table has `id INTEGER PRIMARY KEY`, SELECT rowid,* returns only one rowid-named col)
    const rows = db
      .prepare(`SELECT rowid as _rid_, * FROM "${table}"`)
      .all() as Record<string, unknown>[]

    if (rows.length === 0) {
      logger.info(`  ${table}: 0 rows (skipped)`)
      continue
    }

    const colNames = targets.map(([col]) => col)
    const setParts = colNames.map((col) => `"${col}" = ?`).join(', ')
    const stmt = db.prepare(
      `UPDATE "${table}" SET ${setParts} WHERE rowid = ?`
    )

    for (const row of rows) {
      const values = targets.map(([col, info]) =>
        applyStrategy(row[col], info.anonymize_strategy, salt)
      )
      stmt.run(...values, row._rid_ as number | bigint)
    }

    totalRows += rows.length
    processedTables.push(table)
    logger.info(
      `  ${table}: ${rows.length} rows × ${colNames.length} columns anonymized`
    )
  }

  return { tables: processedTables, rowsProcessed: totalRows }
}

// ─── File-level entry point ───────────────────────────────────────────────────

export interface AnonymizeFileOptions {
  inFile: string
  outFile: string
  manifest: ClassificationManifest
  logger: AnonymizeLogger
}

/**
 * Copy `inFile` to `outFile` then anonymize the copy.
 * Never touches the source database.
 */
export async function anonymizeFile(
  options: AnonymizeFileOptions
): Promise<AnonymizeResult> {
  const { inFile, outFile, manifest, logger } = options

  if (!existsSync(inFile)) {
    throw new Error(`Source database not found: ${inFile}`)
  }

  mkdirSync(dirname(outFile), { recursive: true })
  copyFileSync(inFile, outFile)
  logger.info(`Copied ${inFile} → ${outFile}`)

  const runtime = await loadSqliteRuntime()
  const db = runtime.open(outFile)
  try {
    return anonymizeDb(db, manifest, logger)
  } finally {
    db.close()
  }
}
