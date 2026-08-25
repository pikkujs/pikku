import type { KyselyPlugin, RootOperationNode, UnknownRow } from 'kysely'
import type {
  ClassificationManifest,
  ColumnForm,
} from '@pikku/core/classification'
import {
  DEFAULT_KEY_ID,
  isColumnEnvelope,
  type ClassificationCrypto,
} from './classification-crypto.js'

/** What the manifest says about one column, reduced to what the query path needs. */
interface EncryptedColumn {
  form: Extract<ColumnForm, 'wrapped' | 'sealed'>
  keyId: string
}

interface ResolvedManifest {
  /** `table.column` → column, for the exact per-query resolution. */
  qualified: Map<string, EncryptedColumn>
  /** `column` → column, the fallback for when the query's tables say nothing. */
  flat: Map<string, EncryptedColumn>
}

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * Flatten the manifest into a table-qualified lookup plus a bare column-name
 * fallback, both indexed under snake_case and camelCase so the plugin works on
 * either side of `CamelCasePlugin` in the array.
 *
 * A bare name two tables disagree about is dropped rather than letting the last
 * one win: on a joined query it could carry either, and guessing wrong means
 * either handing back ciphertext or refusing a legitimate write. The qualified
 * map still resolves it whenever the query names its tables.
 */
function buildManifest(manifest: ClassificationManifest): ResolvedManifest {
  const qualified = new Map<string, EncryptedColumn>()
  const flat = new Map<string, EncryptedColumn>()
  const ambiguous = new Set<string>()

  const assignFlat = (key: string, column: EncryptedColumn) => {
    const existing = flat.get(key)
    if (existing && existing.keyId !== column.keyId) {
      ambiguous.add(key)
      return
    }
    flat.set(key, column)
  }

  for (const [table, columns] of Object.entries(manifest.tables)) {
    for (const [name, classification] of Object.entries(columns)) {
      const form = classification.form
      if (form !== 'wrapped' && form !== 'sealed') continue

      const column: EncryptedColumn = {
        form,
        keyId: classification.keyId ?? DEFAULT_KEY_ID,
      }
      const camel = snakeToCamel(name)
      qualified.set(`${table}.${name}`, column)
      qualified.set(`${table}.${camel}`, column)
      assignFlat(name, column)
      assignFlat(camel, column)
    }
  }

  for (const key of ambiguous) flat.delete(key)
  return { qualified, flat }
}

function collectQueryTables(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return

  const op = node as {
    kind?: string
    table?: { identifier?: { name?: string } }
  }
  if (op.kind === 'TableNode') {
    const name = op.table?.identifier?.name
    if (typeof name === 'string' && name.length > 0) out.add(name)
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectQueryTables(item, out)
    } else {
      collectQueryTables(value, out)
    }
  }
}

function lookupColumn(
  manifest: ResolvedManifest,
  tables: readonly string[],
  column: string
): EncryptedColumn | undefined {
  let matched: EncryptedColumn | undefined
  for (const table of tables) {
    const found = manifest.qualified.get(`${table}.${column}`)
    if (!found) continue
    if (matched && matched.keyId !== found.keyId) {
      return manifest.flat.get(column)
    }
    matched = found
  }
  return matched ?? manifest.flat.get(column)
}

/**
 * The column names an insert or update writes, paired with the values going
 * into them.
 *
 * Only literal values are collected. A raw expression or a sub-select is
 * something this plugin cannot read and must not guess at, so it is skipped —
 * the guard's job is to catch a plaintext string a call site forgot to encrypt,
 * not to prove every write correct.
 */
function collectWrittenValues(node: unknown): Array<[string, unknown]> {
  const written: Array<[string, unknown]> = []

  const visit = (current: unknown): void => {
    if (!current || typeof current !== 'object') return
    const op = current as {
      kind?: string
      column?: { column?: { name?: string } }
      value?: { kind?: string; value?: unknown }
      columns?: Array<{ column?: { name?: string } }>
      values?: unknown
    }

    if (op.kind === 'ColumnUpdateNode') {
      const name = op.column?.column?.name
      if (typeof name === 'string' && op.value?.kind === 'ValueNode') {
        written.push([name, op.value.value])
      }
    }

    if (op.kind === 'InsertQueryNode' && Array.isArray(op.columns)) {
      const names = op.columns.map((c) => c.column?.name)
      const rows = (op.values as { kind?: string; values?: unknown[] })?.values
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const list = (row as { kind?: string; values?: unknown[] })?.values
          if (!Array.isArray(list)) continue
          list.forEach((value, index) => {
            const name = names[index]
            if (typeof name !== 'string') return
            const unwrapped =
              value && typeof value === 'object' && 'kind' in value
                ? (value as { kind?: string; value?: unknown }).kind ===
                  'ValueNode'
                  ? (value as { value?: unknown }).value
                  : undefined
                : value
            if (unwrapped !== undefined) written.push([name, unwrapped])
          })
        }
      }
    }

    for (const value of Object.values(current)) {
      if (Array.isArray(value)) {
        for (const item of value) visit(item)
      } else {
        visit(value)
      }
    }
  }

  visit(node)
  return written
}

export interface CreateClassificationPluginOptions {
  manifest: ClassificationManifest
  crypto: ClassificationCrypto
}

/**
 * Make a column's at-rest form a property of the column rather than of the
 * developer's memory.
 *
 * Reads are transparent: a `wrapped` column comes back decrypted, so
 * application code never sees an envelope. `hashed` and `plain` columns are
 * untouched, which is what keeps the rest of the schema queryable.
 *
 * Writes are *guarded* rather than transformed, and the reason is Kysely's
 * shape, not a preference: `transformQuery` is synchronous and WebCrypto is
 * not, so a plugin cannot encrypt on the way in. Encrypting at the call site
 * and letting a forgotten call slip through silently is the failure this
 * design exists to prevent, so the guard refuses any plaintext heading for a
 * `wrapped` or `sealed` column. Values are produced with
 * `ClassificationCrypto.encryptColumn`.
 *
 * A `sealed` column is never decrypted on the way out — the application holds
 * only the public half by definition, so returning it as stored is correct
 * rather than a gap.
 */
export function createClassificationPlugin(
  options: CreateClassificationPluginOptions
): KyselyPlugin {
  const manifest = buildManifest(options.manifest)
  const queryTables = new WeakMap<object, readonly string[]>()

  return {
    transformQuery(args) {
      const tables = new Set<string>()
      collectQueryTables(args.node as RootOperationNode, tables)
      queryTables.set(args.queryId, [...tables])

      for (const [name, value] of collectWrittenValues(args.node)) {
        if (value === null || value === undefined) continue
        const column = lookupColumn(manifest, [...tables], name)
        if (!column) continue
        if (!isColumnEnvelope(value)) {
          throw new Error(
            `Refusing to write plaintext into "${name}", which is classified ${column.form}. ` +
              `Produce the value with ClassificationCrypto.encryptColumn() before writing it.`
          )
        }
      }

      return args.node
    },

    async transformResult(args) {
      const tables = queryTables.get(args.queryId) ?? []
      const rows: UnknownRow[] = []

      for (const row of args.result.rows as UnknownRow[]) {
        let next: UnknownRow | undefined
        for (const [name, value] of Object.entries(row)) {
          if (value === null || value === undefined) continue
          const column = lookupColumn(manifest, tables, name)
          if (!column || column.form !== 'wrapped') continue
          if (!isColumnEnvelope(value)) continue
          next ??= { ...row }
          next[name] = await options.crypto.decryptColumn(value)
        }
        rows.push(next ?? row)
      }

      return { ...args.result, rows }
    },
  }
}
