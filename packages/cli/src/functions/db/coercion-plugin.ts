import type { KyselyPlugin, UnknownRow } from 'kysely'

export type ColumnKind = 'date' | 'bool' | 'json'

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

function buildGlobalMap(map: CoercionMap): Record<string, ColumnKind> {
  const out: Record<string, ColumnKind> = {}
  for (const tbl of Object.values(map)) {
    for (const [col, kind] of Object.entries(tbl)) {
      out[col] = kind
      out[snakeToCamel(col)] = kind
    }
  }
  return out
}

export function createCoercionPlugin(
  options: CreateCoercionPluginOptions
): KyselyPlugin {
  const globalMap = buildGlobalMap(options.map)
  return {
    transformQuery(args) {
      return args.node
    },
    async transformResult(args) {
      const out: UnknownRow[] = []
      for (const row of args.result.rows as UnknownRow[]) {
        const next: UnknownRow = { ...row }
        for (const [col, val] of Object.entries(row)) {
          const kind = globalMap[col]
          if (kind) next[col] = fromDb(val, kind)
        }
        out.push(next)
      }
      return { ...args.result, rows: out }
    },
  }
}
