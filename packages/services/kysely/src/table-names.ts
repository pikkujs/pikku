/**
 * Node kinds whose payload is caller data, never query structure. A table
 * name cannot be inside one, so the walk does not enter them: that keeps it
 * from reading a parameter value (a big array, a Buffer) and from being
 * fooled by a value shaped like a `TableNode`.
 */
const VALUE_KINDS = new Set(['ValueNode', 'PrimitiveValueListNode'])

/**
 * Adds to `out` the name of every table a Kysely operation node reads or
 * writes, in the order the walk meets them (so the first one is the main
 * table of a select, insert, update or delete).
 */
export function collectTableNames(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== 'object') return

  const candidate = node as {
    kind?: string
    table?: { identifier?: { name?: string } }
  }

  if (candidate.kind !== undefined && VALUE_KINDS.has(candidate.kind)) return

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

/** The only shape of identifier whose text is recorded. */
export const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

const KNOWN_KINDS = new Set(
  (
    'AddColumnNode AddConstraintNode AddIndexNode AddValueNode AggregateFunctionNode AliasNode ' +
    'AlterColumnNode AlterTableNode AlterTypeNode AndNode BinaryOperationNode CaseNode CastNode ' +
    'CheckConstraintNode CollateNode ColumnDefinitionNode ColumnNode ColumnUpdateNode ' +
    'CommonTableExpressionNameNode CommonTableExpressionNode CreateIndexNode CreateSchemaNode ' +
    'CreateTableNode CreateTypeNode CreateViewNode DataTypeNode DefaultInsertValueNode ' +
    'DefaultValueNode DeleteQueryNode DropColumnNode DropConstraintNode DropIndexNode ' +
    'DropSchemaNode DropTableNode DropTypeNode DropViewNode ExplainNode FetchNode ' +
    'ForeignKeyConstraintNode FromNode FunctionNode GeneratedNode GroupByItemNode GroupByNode ' +
    'HavingNode IdentifierNode InsertQueryNode JoinNode JSONOperatorChainNode JSONPathLegNode ' +
    'JSONPathNode JSONReferenceNode LimitNode ListNode MatchedNode MergeQueryNode ' +
    'ModifyColumnNode OffsetNode OnConflictNode OnDuplicateKeyNode OnNode OperatorNode ' +
    'OrActionNode OrderByItemNode OrderByNode OrNode OutputNode OverNode ParensNode ' +
    'PartitionByItemNode PartitionByNode PrimaryKeyConstraintNode PrimitiveValueListNode RawNode ' +
    'ReferenceNode ReferencesNode RefreshMaterializedViewNode RenameColumnNode ' +
    'RenameConstraintNode RenameValueNode ReturningNode SchemableIdentifierNode SelectAllNode ' +
    'SelectionNode SelectModifierNode SelectQueryNode SetOperationNode TableNode TopNode ' +
    'TupleNode UnaryOperationNode UniqueConstraintNode UpdateQueryNode UsingNode ValueListNode ' +
    'ValueNode ValuesNode WhenNode WhereNode WithNode'
  ).split(' ')
)

/** Kinds that carry caller-controllable text no pattern can vouch for. */
const INLINE_KINDS = new Set(['RawNode', 'JSONPathNode', 'JSONPathLegNode'])

/** Every keyword a node's own string field may hold (operators, modifiers, join types...). */
const KEYWORDS = new Set([
  ...[
    '=',
    '==',
    '!=',
    '<>',
    '>',
    '>=',
    '<',
    '<=',
    'in',
    'not in',
    'is',
    'is not',
  ],
  ...[
    'like',
    'not like',
    'match',
    'ilike',
    'not ilike',
    '@>',
    '<@',
    '^@',
    '&&',
  ],
  ...[
    '?',
    '?&',
    '?|',
    '!<',
    '!>',
    '<=>',
    '!~',
    '~',
    '~*',
    '!~*',
    '@@',
    '@@@',
    '!!',
  ],
  ...['<->', 'regexp', 'is distinct from', 'is not distinct from'],
  ...[
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
    '&',
    '|',
    '#',
    '<<',
    '>>',
    '||',
    '->',
    '->>',
  ],
  ...[
    '->$',
    '->>$',
    'exists',
    'not exists',
    'not',
    'between',
    'between symmetric',
  ],
  ...['InnerJoin', 'LeftJoin', 'RightJoin', 'FullJoin', 'CrossJoin'],
  ...['LateralInnerJoin', 'LateralLeftJoin', 'LateralCrossJoin', 'Using'],
  ...[
    'OuterApply',
    'CrossApply',
    'only',
    'with ties',
    'percent',
    'percent with ties',
  ],
  ...[
    'first',
    'last',
    'cascade',
    'restrict',
    'no action',
    'set default',
    'set null',
  ],
  ...['preserve rows', 'delete rows', 'drop'],
  ...[
    'ForUpdate',
    'ForNoKeyUpdate',
    'ForShare',
    'ForKeyShare',
    'NoWait',
    'SkipLocked',
    'Distinct',
  ],
  ...['text', 'json', 'xml', 'yaml', 'traditional', 'tree'],
  ...['ignore', 'replace', 'abort', 'fail', 'rollback'],
])

const DATA_TYPES = new Set(
  (
    'varchar char text integer int2 int4 int8 smallint bigint boolean real double~precision float4 float8 ' +
    'decimal numeric binary bytea date datetime time timetz timestamp timestamptz serial bigserial uuid ' +
    'json jsonb datetime2 blob varbinary int4range int4multirange int8range int8multirange numrange ' +
    'nummultirange tsrange tsmultirange tstzrange tstzmultirange daterange datemultirange'
  )
    .split(' ')
    .map((t) => t.replace('~', ' '))
)

const isDataType = (value: string): boolean => {
  const match = /^([a-z0-9 ]+?)(?:\(\d+(?:, \d+)?\))?$/.exec(value)
  return match !== null && DATA_TYPES.has(match[1]!)
}

/**
 * True when the node tree can put caller text into the compiled SQL itself
 * rather than as a parameter: raw SQL, an immediate value (`sql.lit`), a JSON
 * path, an identifier or function name outside {@link SAFE_IDENTIFIER}, or any
 * node kind or string field this function has not classified. Parameter values
 * are not entered. Fails closed: unknown means true.
 */
export function hasInlineSql(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasInlineSql)
  if (!node || typeof node !== 'object') return false
  const record = node as Record<string, unknown>
  const kind = record.kind
  if (kind !== undefined) {
    if (typeof kind !== 'string' || !KNOWN_KINDS.has(kind)) return true
    if (INLINE_KINDS.has(kind)) return true
    if (kind === 'ValueNode') return record.immediate === true
    if (kind === 'PrimitiveValueListNode') return false
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === 'kind') continue
    if (typeof value === 'string') {
      if (key === 'name' && kind === 'IdentifierNode') {
        if (!SAFE_IDENTIFIER.test(value)) return true
      } else if (
        key === 'func' &&
        (kind === 'FunctionNode' || kind === 'AggregateFunctionNode')
      ) {
        if (!SAFE_IDENTIFIER.test(value)) return true
      } else if (key === 'dataType' && kind === 'DataTypeNode') {
        if (!isDataType(value)) return true
      } else if (!KEYWORDS.has(value)) {
        return true
      }
    } else if (hasInlineSql(value)) {
      return true
    }
  }
  return false
}
