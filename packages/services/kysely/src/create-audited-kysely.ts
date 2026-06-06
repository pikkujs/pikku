import type { AuditLog } from '@pikku/core'
import type {
  Kysely,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely'

export interface CreateAuditedKyselyOptions {
  audit: AuditLog
  auditReads?: boolean
  eventType?: string
  transactionId?: string | null
  queryIdPrefix?: string
}

type AuditedQuery = {
  queryKind: 'select' | 'insert' | 'update' | 'delete'
  queryId: string
  tables: string[]
  changedColumns?: string[]
  changes?: unknown
}

const QUERY_KIND_BY_NODE: Record<
  string,
  AuditedQuery['queryKind'] | undefined
> = {
  SelectQueryNode: 'select',
  InsertQueryNode: 'insert',
  UpdateQueryNode: 'update',
  DeleteQueryNode: 'delete',
}

function getIdentifierName(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined
  const candidate = node as {
    name?: string
    column?: { name?: string }
    identifier?: { name?: string }
    table?: { identifier?: { name?: string } }
  }
  return (
    candidate.name ??
    candidate.column?.name ??
    candidate.identifier?.name ??
    candidate.table?.identifier?.name
  )
}

function collectTableNames(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return

  const candidate = node as {
    kind?: string
    table?: { identifier?: { name?: string } }
  }

  if (
    candidate.kind === 'TableNode' &&
    typeof candidate.table?.identifier?.name === 'string'
  ) {
    out.add(candidate.table.identifier.name)
  }

  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) collectTableNames(item, out)
      continue
    }
    collectTableNames(value, out)
  }
}

function extractValue(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node

  const candidate = node as {
    kind?: string
    value?: unknown
    values?: unknown[]
    left?: unknown
    right?: unknown
  }

  switch (candidate.kind) {
    case 'ValueNode':
      return candidate.value
    case 'PrimitiveValueListNode':
    case 'ValueListNode':
      return (candidate.values ?? []).map(extractValue)
    case 'DefaultInsertValueNode':
      return '[default]'
    case 'ColumnNode':
    case 'ReferenceNode':
      return `[${candidate.kind}]`
    case 'RawNode':
      return '[raw]'
    case 'SelectQueryNode':
      return '[subquery]'
    case 'ParensNode':
      return extractValue((candidate as { node?: unknown }).node)
    case 'BinaryOperationNode':
      return {
        left: extractValue(candidate.left),
        right: extractValue(candidate.right),
      }
    default:
      return `[${candidate.kind ?? 'expression'}]`
  }
}

function extractInsertChanges(node: any): {
  changedColumns?: string[]
  changes?: unknown
} {
  const columns = Array.isArray(node.columns)
    ? node.columns
        .map((column: unknown) => getIdentifierName(column))
        .filter(Boolean)
    : []
  const values = Array.isArray(node.values?.values) ? node.values.values : []
  if (columns.length === 0 || values.length === 0) {
    return {
      changedColumns: columns.length > 0 ? columns : undefined,
    }
  }

  const rows = values.map((row: any) => {
    const rowValues = Array.isArray(row?.values)
      ? row.values.map(extractValue)
      : []
    return Object.fromEntries(
      columns.map((column, index) => [column, rowValues[index]])
    )
  })

  return {
    changedColumns: columns,
    changes: rows.length === 1 ? rows[0] : rows,
  }
}

function extractUpdateChanges(node: any): {
  changedColumns?: string[]
  changes?: unknown
} {
  const updates = Array.isArray(node.updates) ? node.updates : []
  const entries = updates
    .map((update: any) => {
      const column = getIdentifierName(update.column)
      if (!column) return null
      return [column, extractValue(update.value)] as const
    })
    .filter(Boolean) as Array<readonly [string, unknown]>

  if (entries.length === 0) {
    return {}
  }

  return {
    changedColumns: entries.map(([column]) => column),
    changes: Object.fromEntries(entries),
  }
}

function extractChangeSet(
  node: RootOperationNode,
  queryKind: AuditedQuery['queryKind']
) {
  if (queryKind === 'insert') {
    return extractInsertChanges(node as any)
  }
  if (queryKind === 'update') {
    return extractUpdateChanges(node as any)
  }
  return {}
}

class AuditedKyselyPlugin implements KyselyPlugin {
  private readonly pending = new Map<unknown, AuditedQuery>()
  private queryCounter = 0

  constructor(private readonly options: CreateAuditedKyselyOptions) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const queryKind =
      QUERY_KIND_BY_NODE[(args.node as { kind?: string }).kind ?? '']
    if (!queryKind) {
      return args.node
    }

    if (queryKind === 'select' && this.options.auditReads === false) {
      return args.node
    }

    const tables = new Set<string>()
    collectTableNames(args.node, tables)
    const queryId = `${this.options.queryIdPrefix ?? 'q'}-${++this.queryCounter}`
    this.pending.set(args.queryId, {
      queryKind,
      queryId,
      tables: [...tables].sort(),
      ...extractChangeSet(args.node, queryKind),
    })
    return args.node
  }

  async transformResult(
    args: PluginTransformResultArgs
  ): Promise<QueryResult<UnknownRow>> {
    const pending = this.pending.get(args.queryId)
    if (!pending) {
      return args.result
    }

    this.pending.delete(args.queryId)
    const rawResult = args.result as QueryResult<UnknownRow> & {
      numAffectedRows?: bigint
      numUpdatedOrDeletedRows?: bigint
    }
    const rowCount =
      rawResult.rows.length > 0
        ? rawResult.rows.length
        : Number(
            rawResult.numUpdatedOrDeletedRows ?? rawResult.numAffectedRows ?? 0n
          )

    await this.options.audit.write({
      type: this.options.eventType ?? 'db.query',
      source: 'auto',
      transactionId: this.options.transactionId ?? null,
      queryId: pending.queryId,
      metadata: {
        queryKind: pending.queryKind,
        tables: pending.tables,
        changedColumns: pending.changedColumns,
        changes: pending.changes,
        rowCount,
      },
    })
    return rawResult
  }
}

export function createAuditedKysely<DB>(
  db: Kysely<DB>,
  options: CreateAuditedKyselyOptions
): Kysely<DB> {
  return db.withPlugin(new AuditedKyselyPlugin(options))
}
