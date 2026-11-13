import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ColumnConstraints } from '@pikku/core/db'
import type { ColumnKind } from '@pikku/kysely'
import { ZOD_FORMATS, type ZodFormat } from './zod-codegen.js'

/**
 * The kinds a column may declare in `db/tables.ts`. A strict superset of
 * the runtime `ColumnKind`, which is the value type of the generated
 * `CoercionMap`: `uuid` selects the generated `Uuid` TypeScript type but needs
 * no runtime coercion (a UUID is a string in both Postgres and SQLite), so the
 * codegen never emits it into `coercion.gen.ts`.
 */
export type AnnotationKind = ColumnKind | 'uuid'

type Classification = 'public' | 'private' | 'pii' | 'secret'
type AnonymizeStrategy = 'fake:email' | 'fake:name' | 'hash' | 'keep' | null
type ColumnForm = 'plain' | 'hashed' | 'wrapped' | 'sealed'

export const COLUMN_FORMS = [
  'plain',
  'hashed',
  'wrapped',
  'sealed',
] as const satisfies readonly ColumnForm[]

export interface ColAnnotation extends ColumnConstraints {
  /** Column kind override: `date`, `bool`, `json`, or `uuid`. */
  kind?: AnnotationKind
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
  /**
   * Which key protects this column, for an encrypted `form`. Absent means the
   * deployment's default key.
   *
   * Reported as authored rather than defaulted here, so the manifest emitter
   * stays the single place the default is applied.
   */
  keyId?: string
}

/** Per-table, per-column annotation map sourced from the columns in `db/tables.ts`. */
export type AnnotationMap = Record<string, Record<string, ColAnnotation>>

/**
 * Warn-only naming heuristic. We no longer *infer* a column's kind from its
 * name (it produced wrong types — e.g. SQLite stores `*_at` as ISO TEXT, not a
 * `Date`). Instead the codegen warns when a column name looks like it wants a
 * `kind` but none is declared in `db/tables.ts`, so the developer can opt
 * in explicitly. Returns the *suggested* kind, or null.
 */
export function nameSuggestsKind(colName: string): AnnotationKind | null {
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
  keyId?: string
  kind?: string
  tsType?: string
  format?: string
  description?: string
  enum?: unknown
  min?: unknown
  max?: unknown
  minLength?: unknown
  maxLength?: unknown
  pattern?: unknown
}

type RawTable = Record<string, RawEntry | null>

/**
 * Load annotations from the `db/annotations.gen.json` sidecar, which `pikku db
 * migrate` writes from the column annotations in `db/tables.ts`. This is the
 * single source of column classification and type-override information —
 * there is no SQL-comment fallback.
 *
 * Each entry is `{ security?, classification?: <anonymize strategy>, kind?,
 * tsType?, format?, form?, keyId?, description?, enum?, min?, max?, minLength?,
 * maxLength?, pattern? }`, keyed by the bare physical
 * table name and then the physical column name, which is how the codegen looks
 * columns up. Returns `{}` when there is no sidecar (a project that declares no
 * tables).
 */
export function loadAnnotations(rootDir: string): AnnotationMap {
  const jsonPath = join(rootDir, 'db', 'annotations.gen.json')
  if (!existsSync(jsonPath)) return {}
  try {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8'))

    const result: AnnotationMap = {}
    for (const [table, cols] of Object.entries(
      raw as Record<string, RawTable>
    )) {
      if (!cols || typeof cols !== 'object') continue
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
        // `security` is the privacy level; `form` is how it is held at rest.
        switch (ann.security) {
          case 'public':
          case 'private':
          case 'pii':
          case 'secret':
            entry.classification = ann.security
            break
        }
        if (
          ann.form &&
          (COLUMN_FORMS as readonly string[]).includes(ann.form)
        ) {
          entry.form = ann.form as ColumnForm
        }
        if (ann.keyId) entry.keyId = ann.keyId
        if (
          Array.isArray(ann.enum) &&
          ann.enum.length > 0 &&
          ann.enum.every((v) => typeof v === 'string')
        ) {
          entry.enum = ann.enum
        }
        for (const field of ['min', 'max', 'minLength', 'maxLength'] as const) {
          const value = ann[field]
          if (typeof value === 'number' && Number.isFinite(value)) {
            entry[field] = value
          }
        }
        if (typeof ann.pattern === 'string') entry.pattern = ann.pattern
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
