import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ColumnKind } from './coercion-plugin.js'
import { ZOD_FORMATS, type ZodFormat } from './zod-codegen.js'

type Classification = 'public' | 'private' | 'pii' | 'secret'
type AnonymizeStrategy = 'fake:email' | 'fake:name' | 'hash' | 'keep' | null
type ColumnForm = 'plain' | 'hashed' | 'wrapped' | 'sealed'

export const COLUMN_FORMS = [
  'plain',
  'hashed',
  'wrapped',
  'sealed',
] as const satisfies readonly ColumnForm[]

export interface ColAnnotation {
  /** Column kind override: `date`, `bool`, `json`, or `uuid`. */
  kind?: ColumnKind
  /** TypeScript type string that overrides the inferred column type, e.g. `string[]`. */
  tsType?: string
  /**
   * Zod string-format validator (`email`, `url`, …). Refines the zod schema only;
   * the TypeScript type stays `string`. Applied by the codegen only when the
   * column's resolved type is plain `string`.
   */
  format?: ZodFormat
  classification?: Classification
  anonymize?: AnonymizeStrategy
  /**
   * At-rest representation, independent of `classification`. Drives the
   * insert/update brand on the generated column type. Absent means `plain`.
   */
  form?: ColumnForm
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

interface RawEntry {
  security?: string
  classification?: string
  form?: string
  kind?: string
  tsType?: string
  format?: string
  description?: string
}

type RawTable = Record<string, RawEntry | null>

/**
 * A column entry's own values are all primitives; a table's are objects. That
 * is the only structural difference between the two levels, and it is what
 * tells a schema-qualified map (`{ app: { user: { … } } }`) from a bare one
 * (`{ user: { … } }`) without having to be told which shape was authored.
 */
function isColumnEntry(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).every(
    (v) => typeof v !== 'object' || v === null
  )
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
 *
 * `DbClassificationMap` nests under the schema name whenever the project has
 * one (`{ app: { user: { email: … } } }`), so the sidecar is flattened back to
 * bare table names here — the codegen looks columns up by `bareTableName`.
 * Reading a schema-qualified map as though it were flat silently yields an
 * annotation for every column of every table, which is how a project could
 * classify a column `secret` and still generate it as `private`.
 */
export function loadAnnotations(rootDir: string): AnnotationMap {
  const jsonPath = join(rootDir, 'db', 'annotations.gen.json')
  if (!existsSync(jsonPath)) return {}
  try {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<
      string,
      Record<string, unknown>
    >

    const tables: Array<[string, RawTable]> = []
    for (const [key, value] of Object.entries(raw)) {
      if (!value || typeof value !== 'object') continue
      const isTable = Object.values(value).every(
        (v) => v === null || isColumnEntry(v)
      )
      if (isTable) {
        tables.push([key, value as RawTable])
        continue
      }
      // `key` is a schema; its values are the tables.
      for (const [table, cols] of Object.entries(value)) {
        if (cols && typeof cols === 'object') {
          tables.push([table, cols as RawTable])
        }
      }
    }

    const result: AnnotationMap = {}
    for (const [table, cols] of tables) {
      result[table] = {}
      for (const [col, ann] of Object.entries(cols)) {
        if (!ann) continue
        const entry: ColAnnotation = {}
        if (
          ann.kind === 'bool' ||
          ann.kind === 'date' ||
          ann.kind === 'json' ||
          ann.kind === 'uuid'
        )
          entry.kind = ann.kind
        if (ann.tsType) entry.tsType = ann.tsType
        if (ann.format && ann.format in ZOD_FORMATS)
          entry.format = ann.format as ZodFormat
        // `security` is the privacy level. The legacy `encrypted` value
        // predates `form` and conflated the two axes; it still parses, as the
        // pair it always meant.
        switch (ann.security) {
          case 'public':
          case 'private':
          case 'pii':
          case 'secret':
            entry.classification = ann.security
            break
          case 'encrypted':
            entry.classification = 'secret'
            entry.form = 'wrapped'
            break
        }
        // An explicit `form` wins over the one implied by legacy `encrypted`.
        if (
          ann.form &&
          (COLUMN_FORMS as readonly string[]).includes(ann.form)
        ) {
          entry.form = ann.form as ColumnForm
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
