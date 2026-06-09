import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ColumnKind } from './coercion-plugin.js'

type Classification = 'public' | 'private' | 'pii' | 'secret'
type AnonymizeStrategy = 'fake:email' | 'fake:name' | 'hash' | 'keep' | null

export interface ColAnnotation {
  kind?: ColumnKind
  /** TypeScript type string for @json columns, e.g. `string[]`. */
  tsType?: string
  classification?: Classification
  anonymize?: AnonymizeStrategy
}

/** Per-table, per-column annotation map built from migration SQL comments. */
export type AnnotationMap = Record<string, Record<string, ColAnnotation>>

/**
 * Determine column kind from naming conventions:
 *   *_at / *_on            → date
 *   is_* / has_* / can_*   → bool
 */
export function annotationFromName(
  colName: string
): { kind: ColumnKind } | null {
  if (/_at$|_on$/.test(colName)) return { kind: 'date' }
  if (/^is_|^has_|^can_/.test(colName)) return { kind: 'bool' }
  return null
}

// ── camelCase → snake_case conversion ────────────────────────────────────────

function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase()
}

// ── Load from db/annotations.ts sidecar ──────────────────────────────────────

/**
 * Try to load annotations from a `db/annotations.ts` (or `.js`) sidecar file
 * in `rootDir`. Returns null if the file doesn't exist.
 *
 * The sidecar uses camelCase keys (matching the Kysely DB interface).
 * We convert them to snake_case to match the raw introspected table/column names.
 */
async function loadAnnotationsSidecar(rootDir: string): Promise<AnnotationMap | null> {
  const candidates = [
    join(rootDir, 'db', 'annotations.js'),
    join(rootDir, 'db', 'annotations.ts'),
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) return null

  let mod: { annotations?: Record<string, Record<string, {
    visibility?: string
    classification?: string
    kind?: string
    tsType?: string
  }>> }
  try {
    mod = await import(found)
  } catch {
    return null
  }

  const raw = mod.annotations
  if (!raw || typeof raw !== 'object') return null

  const result: AnnotationMap = {}
  for (const [camelTable, cols] of Object.entries(raw)) {
    if (!cols || typeof cols !== 'object') continue
    const snakeTable = camelToSnake(camelTable)
    result[snakeTable] = {}
    for (const [camelCol, ann] of Object.entries(cols)) {
      if (!ann || typeof ann !== 'object') continue
      const snakeCol = camelToSnake(camelCol)
      const entry: ColAnnotation = {}

      if (ann.kind === 'bool' || ann.kind === 'date' || ann.kind === 'json') {
        entry.kind = ann.kind
      }
      if (ann.tsType) entry.tsType = ann.tsType

      const vis = ann.visibility
      if (vis === 'public' || vis === 'private' || vis === 'secret') {
        entry.classification = vis
      }

      result[snakeTable][snakeCol] = entry
    }
  }
  return result
}

// ── SQL comment parsing (fallback) ───────────────────────────────────────────

function parseStrategy(s: string | undefined): AnonymizeStrategy {
  if (!s) return null
  const valid = ['fake:email', 'fake:name', 'hash', 'keep'] as const
  return (valid as readonly string[]).includes(s)
    ? (s as AnonymizeStrategy)
    : null
}

function parseComment(comment: string): Partial<ColAnnotation> {
  const ann: Partial<ColAnnotation> = {}

  if (/@bool\b/i.test(comment)) {
    ann.kind = 'bool'
  } else if (/@date\b/i.test(comment)) {
    ann.kind = 'date'
  } else {
    const jsonM = comment.match(/@json\b(?:\s+([^\s@]+))?/i)
    if (jsonM) {
      ann.kind = 'json'
      if (jsonM[1]) ann.tsType = jsonM[1].trim()
    }
  }

  const classM = comment.match(/@(public|private|pii|secret)(?::([^\s@]+))?/i)
  if (classM) {
    ann.classification = classM[1]!.toLowerCase() as Classification
    ann.anonymize = parseStrategy(classM[2])
  }

  return ann
}

/**
 * Parse `-- @bool | @date | @json [TsType] | @public | @private[:strategy] | @pii[:strategy] | @secret[:strategy]`
 * inline annotations from migration SQL files in `migrationsDir`.
 */
export function parseAnnotations(migrationsDir: string): AnnotationMap {
  let files: string[]
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  } catch {
    return {}
  }

  const result: AnnotationMap = {}

  function merge(tableName: string, colName: string, partial: Partial<ColAnnotation>): void {
    if (!partial.kind && partial.classification === undefined) return
    if (!result[tableName]) result[tableName] = {}
    result[tableName][colName] = { ...result[tableName][colName], ...partial }
  }

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf8')

    const createTablePattern =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s*\(([^;]+)\)/gis
    let tableMatch: RegExpExecArray | null
    while ((tableMatch = createTablePattern.exec(content)) !== null) {
      const tableName = tableMatch[1]!.toLowerCase()
      const body = tableMatch[2]!
      for (const line of body.split('\n')) {
        const trimmed = line.trim()
        if (/^(PRIMARY|UNIQUE|CHECK|FOREIGN|CONSTRAINT)/i.test(trimmed))
          continue
        const lineMatch = trimmed.match(/^(\w+)\s+\w[^-]*--\s*(.+?)\s*,?\s*$/)
        if (!lineMatch) continue
        merge(
          tableName,
          lineMatch[1]!.toLowerCase(),
          parseComment(lineMatch[2]!)
        )
      }
    }

    const alterPattern =
      /ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+(?:COLUMN\s+)?"?(\w+)"?\s+\w[^;\n-]*(?:;\s*)?--\s*(.+?)(?:\r?\n|$)/gim
    let alterMatch: RegExpExecArray | null
    while ((alterMatch = alterPattern.exec(content)) !== null) {
      merge(
        alterMatch[1]!.toLowerCase(),
        alterMatch[2]!.toLowerCase(),
        parseComment(alterMatch[3]!)
      )
    }
  }

  return result
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Load annotations for a project. Tries `db/annotations.ts` sidecar first;
 * falls back to SQL comment parsing from `migrationsDir` if not found.
 */
export async function loadAnnotations(
  rootDir: string,
  migrationsDir?: string
): Promise<AnnotationMap> {
  const sidecar = await loadAnnotationsSidecar(rootDir)
  if (sidecar) return sidecar
  return migrationsDir ? parseAnnotations(migrationsDir) : {}
}
