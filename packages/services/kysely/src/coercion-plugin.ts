import type { KyselyPlugin, RootOperationNode, UnknownRow } from 'kysely'

/**
 * The kinds a column can be coerced *to* at runtime. This is the value type of
 * the generated `CoercionMap`, so it is a public artifact contract — a kind may
 * only appear here if `fromDb` below actually does something with it.
 *
 * `uuid` is deliberately absent: it is an annotation kind (it selects the `Uuid`
 * TypeScript type in the generated schema) but not a coercion kind, and the
 * codegen filters it out of `coercion.gen.ts` for exactly that reason — a UUID
 * is a string in both Postgres and SQLite.
 */
export type ColumnKind = 'date' | 'bool' | 'json'

/**
 * Per-table column kind map. Keys are the table names queries are written
 * against; inner keys are snake_case column names.
 * Generated into `outDir/db/coercion.gen.ts` by `pikku db migrate` from the
 * explicit `kind` entries in `db/annotations.ts`.
 */
export type CoercionMap = Record<string, Record<string, ColumnKind>>

export interface CreateCoercionPluginOptions {
  map: CoercionMap
}

function fromDb(value: unknown, kind: ColumnKind): unknown {
  if (value == null) return value
  switch (kind) {
    case 'date':
      if (typeof value === 'string') {
        const d = new Date(value)
        return Number.isNaN(d.getTime()) ? value : d
      }
      return value
    case 'bool':
      if (typeof value === 'number') return value !== 0
      if (typeof value === 'bigint') return value !== 0n
      return value
    case 'json':
      if (typeof value !== 'string') return value
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
  }
}

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

interface ResolvedMaps {
  /** `table.column` → kind, for the exact per-query resolution. */
  qualified: Record<string, ColumnKind>
  /** `column` → kind, the fallback for when the query's tables say nothing. */
  flat: Record<string, ColumnKind>
}

/**
 * Flatten the per-table map into a table-qualified lookup plus a bare
 * column-name fallback. Both are indexed by BOTH snake_case and camelCase so
 * they work regardless of CamelCasePlugin ordering in the plugin array.
 *
 * When two tables disagree on the kind for the same column name, the bare name
 * is ambiguous (a joined/aliased query could carry either) and is dropped from
 * the flat map rather than letting whichever table was processed last win. The
 * qualified map still resolves it whenever the query names its tables.
 */
function buildMaps(map: CoercionMap): ResolvedMaps {
  const qualified: Record<string, ColumnKind> = {}
  const flat: Record<string, ColumnKind> = {}
  const ambiguous = new Set<string>()
  const assignFlat = (key: string, kind: ColumnKind) => {
    const existing = flat[key]
    if (existing !== undefined && existing !== kind) {
      ambiguous.add(key)
      return
    }
    flat[key] = kind
  }
  for (const [table, cols] of Object.entries(map)) {
    for (const [col, kind] of Object.entries(cols)) {
      const camel = snakeToCamel(col)
      qualified[`${table}.${col}`] = kind
      qualified[`${table}.${camel}`] = kind
      assignFlat(col, kind)
      assignFlat(camel, kind)
    }
  }
  for (const key of ambiguous) delete flat[key]
  return { qualified, flat }
}

/**
 * Collect every table named anywhere in the query's operation node, so a result
 * column can be resolved against the tables the query actually touched instead
 * of against every table in the schema.
 */
function collectQueryTables(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return

  const op = node as {
    kind?: string
    table?: { identifier?: { name?: string } }
  }
  if (op.kind === 'TableNode') {
    const tableName = op.table?.identifier?.name
    if (typeof tableName === 'string' && tableName.length > 0)
      out.add(tableName)
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectQueryTables(item, out)
    } else {
      collectQueryTables(value, out)
    }
  }
}

/**
 * Resolve a result column's kind against the query's tables, falling back to
 * the bare column name. Tables that disagree with each other are as ambiguous
 * as two schema tables are, so they fall back too.
 */
function lookupKind(
  maps: ResolvedMaps,
  tables: readonly string[],
  col: string
): ColumnKind | undefined {
  let matchedKind: ColumnKind | undefined
  for (const table of tables) {
    const kind = maps.qualified[`${table}.${col}`]
    if (!kind) continue
    if (matchedKind && matchedKind !== kind) return maps.flat[col]
    matchedKind = kind
  }
  return matchedKind ?? maps.flat[col]
}

/**
 * Convert values stored in a dialect's on-disk representation back into the
 * logical types app code expects (Date / boolean / parsed JSON).
 *
 * SQLite is what makes this necessary — it stores dates as TEXT, booleans as
 * INTEGER and JSON as TEXT — but the plugin is dialect-neutral: on Postgres the
 * driver already returns Date/boolean/object, and every branch of `fromDb`
 * passes a non-string, non-number value straight through. That is why it lives
 * in `@pikku/kysely` next to `SerializePlugin` rather than in a SQLite package:
 * the CLI installs it on its local Postgres database too.
 *
 * Write-side coercion (Date → ISO string, boolean → 0/1, object → JSON) is
 * handled in the SQLite database adapters (always-on), so this plugin is
 * read-only.
 *
 * Place AFTER CamelCasePlugin in the plugin array (or it handles both
 * orderings via the dual-keyed maps).
 */
export function createCoercionPlugin(
  options: CreateCoercionPluginOptions
): KyselyPlugin {
  const maps = buildMaps(options.map)
  const queryTables = new WeakMap<object, readonly string[]>()
  return {
    transformQuery(args) {
      const tables = new Set<string>()
      collectQueryTables(args.node as RootOperationNode, tables)
      queryTables.set(args.queryId, [...tables])
      return args.node
    },
    async transformResult(args) {
      const tables = queryTables.get(args.queryId) ?? []
      const out: UnknownRow[] = []
      for (const row of args.result.rows as UnknownRow[]) {
        const next: UnknownRow = { ...row }
        for (const [col, val] of Object.entries(row)) {
          const kind = lookupKind(maps, tables, col)
          if (kind) next[col] = fromDb(val, kind)
        }
        out.push(next)
      }
      return { ...args.result, rows: out }
    },
  }
}
