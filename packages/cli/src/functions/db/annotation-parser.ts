import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ColumnKind } from './coercion-plugin.js'

type Classification = 'public' | 'private' | 'pii' | 'secret'
type AnonymizeStrategy = 'fake:email' | 'fake:name' | 'hash' | 'keep' | null

export interface ColAnnotation {
  /** Column kind override: `date`, `bool`, or `json`. */
  kind?: ColumnKind
  /** TypeScript type string that overrides the inferred column type, e.g. `string[]`. */
  tsType?: string
  classification?: Classification
  anonymize?: AnonymizeStrategy
}

/** Per-table, per-column annotation map sourced from `db/annotations.ts`. */
export type AnnotationMap = Record<string, Record<string, ColAnnotation>>

/**
 * Warn-only naming heuristic. We no longer *infer* a column's kind from its
 * name (it produced wrong types — e.g. SQLite stores `*_at` as ISO TEXT, not a
 * `Date`). Instead the codegen warns when a column name looks like it wants a
 * `kind` but none is declared in `db/annotations.ts`, so the developer can opt
 * in explicitly. Returns the *suggested* kind, or null.
 */
export function nameSuggestsKind(colName: string): ColumnKind | null {
  if (/_at$|_on$/.test(colName)) return 'date'
  if (/^is_|^has_|^can_/.test(colName)) return 'bool'
  return null
}

function parseStrategy(s: string | undefined): AnonymizeStrategy {
  if (!s) return null
  const valid = ['fake:email', 'fake:name', 'hash', 'keep'] as const
  return (valid as readonly string[]).includes(s)
    ? (s as AnonymizeStrategy)
    : null
}

/**
 * Load annotations from the `db/annotations.gen.json` sidecar, which is
 * compiled from the developer-authored `db/annotations.ts` (`DbClassificationMap`)
 * by `syncClassifications`. This is the single source of column classification
 * and type-override information — there is no SQL-comment fallback.
 *
 * The authored `ColumnEntry` shape is:
 *   { security?, classification?: <anonymize strategy>, kind?, tsType?, description? }
 * where `security` is the privacy level and `classification` is the anonymize
 * strategy. Returns `{}` if the sidecar doesn't exist yet (first migrate run,
 * before it has been generated).
 */
export function loadAnnotations(rootDir: string): AnnotationMap {
  const jsonPath = join(rootDir, 'db', 'annotations.gen.json')
  if (!existsSync(jsonPath)) return {}
  try {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<
      string,
      Record<
        string,
        {
          security?: string
          classification?: string
          kind?: string
          tsType?: string
          description?: string
        } | null
      >
    >
    const result: AnnotationMap = {}
    for (const [table, cols] of Object.entries(raw)) {
      result[table] = {}
      for (const [col, ann] of Object.entries(cols)) {
        if (!ann) continue
        const entry: ColAnnotation = {}
        if (ann.kind === 'bool' || ann.kind === 'date' || ann.kind === 'json')
          entry.kind = ann.kind
        if (ann.tsType) entry.tsType = ann.tsType
        // `security` is the privacy level. `encrypted` brands as `secret`.
        switch (ann.security) {
          case 'public':
          case 'private':
          case 'pii':
          case 'secret':
            entry.classification = ann.security
            break
          case 'encrypted':
            entry.classification = 'secret'
            break
        }
        const strategy = parseStrategy(ann.classification)
        if (strategy !== null) entry.anonymize = strategy
        result[table][col] = entry
      }
    }
    return result
  } catch {
    return {}
  }
}
