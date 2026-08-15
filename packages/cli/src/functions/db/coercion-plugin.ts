import type { KyselyPlugin, UnknownRow } from 'kysely'
import type { RootOperationNode } from 'kysely'

export type ColumnKind = 'date' | 'bool' | 'json' | 'uuid'

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
    case 'uuid':
      // UUIDs are strings in both Postgres and SQLite — no runtime coercion.
      // (Codegen also omits `uuid` from the coercion map; this is defensive.)
      return value
  }
}

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function buildGlobalMap(map: CoercionMap): Record<string, ColumnKind> {
  const out: Record<string, ColumnKind> = {}
  for (const [table, tbl] of Object.entries(map)) {
    for (const [col, kind] of Object.entries(tbl)) {
      out[`${table}.${col}`] = kind
      out[`${table}.${snakeToCamel(col)}`] = kind
      out[col] = kind
      out[snakeToCamel(col)] = kind
    }
  }
  return out
}

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

function lookupKind(
  globalMap: Record<string, ColumnKind>,
  tables: readonly string[],
  col: string
): ColumnKind | undefined {
  let matchedKind: ColumnKind | undefined
  for (const table of tables) {
    const kind = globalMap[`${table}.${col}`]
    if (!kind) continue
    if (matchedKind && matchedKind !== kind) return globalMap[col]
    matchedKind = kind
  }
  return matchedKind ?? globalMap[col]
}

export function createCoercionPlugin(
  options: CreateCoercionPluginOptions
): KyselyPlugin {
  const globalMap = buildGlobalMap(options.map)
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
          const kind = lookupKind(globalMap, tables, col)
          if (kind) next[col] = fromDb(val, kind)
        }
        out.push(next)
      }
      return { ...args.result, rows: out }
    },
  }
}
