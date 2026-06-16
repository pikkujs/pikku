/**
 * Serialize / deserialize plugin for Kysely.
 *
 * Adapted from `kysely-plugin-serialize` (MIT, by subframe7536 —
 * https://github.com/subframe7536/kysely-plugin-serialize), which is
 * unmaintained and ships no `exports` map, so modern Node16/ESM resolution
 * falls back to its CommonJS build and cannot import ESM-only kysely (>= 0.29).
 * Maintained here directly as part of @pikku/kysely so we publish it ourselves.
 *
 * Serializes object/array/Date/boolean parameters to strings on the way into
 * SQLite-style dialects, and deserializes them back on the way out.
 */
import {
  OperationNodeTransformer,
  type ColumnUpdateNode,
  type KyselyPlugin,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type PrimitiveValueListNode,
  type QueryId,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
  type ValueNode,
} from 'kysely'

export type Serializer = (parameter: unknown) => unknown
export type Deserializer = (parameter: unknown) => unknown

class SerializeParametersTransformer extends OperationNodeTransformer {
  private readonly serializer: Serializer

  constructor(serializer: Serializer) {
    super()
    this.serializer = serializer
  }

  protected override transformPrimitiveValueList(
    node: PrimitiveValueListNode
  ): PrimitiveValueListNode {
    return {
      ...node,
      values: node.values.map(this.serializer),
    }
  }

  // https://www.npmjs.com/package/zodsql
  protected override transformColumnUpdate(
    node: ColumnUpdateNode
  ): ColumnUpdateNode {
    const { value: valueNode } = node
    if (valueNode.kind !== 'ValueNode') {
      return super.transformColumnUpdate(node)
    }
    const { value, ...item } = valueNode as ValueNode
    const serializedValue = this.serializer(value)
    if (value === serializedValue) {
      return super.transformColumnUpdate(node)
    }
    const serializedNode: ValueNode = { ...item, value: serializedValue }
    return super.transformColumnUpdate({ ...node, value: serializedNode })
  }

  protected override transformValue(node: ValueNode): ValueNode {
    return {
      ...node,
      value: this.serializer(node.value),
    }
  }
}

export const defaultSerializer: Serializer = (parameter) => {
  if (skipTransform(parameter) || typeof parameter === 'string') {
    return parameter
  } else if (typeof parameter === 'boolean') {
    return '' + parameter
  } else if (parameter instanceof Date) {
    return parameter.toISOString()
  } else {
    try {
      return JSON.stringify(parameter)
    } catch {
      return parameter
    }
  }
}

export const dateRegex = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/

export const defaultDeserializer: Deserializer = (parameter) => {
  if (skipTransform(parameter)) {
    return parameter
  }
  if (typeof parameter === 'string') {
    if (parameter === 'true') {
      return true
    } else if (parameter === 'false') {
      return false
    } else if (dateRegex.test(parameter)) {
      return new Date(parameter)
    } else if (maybeJson(parameter)) {
      try {
        return JSON.parse(parameter)
      } catch {
        // not valid JSON — fall through and return the raw string
      }
    }
    return parameter
  }
  return parameter
}

/**
 * Checks if a given string parameter is a JSON-like string.
 *
 * Determines whether the input starts and ends with curly braces `{}` or
 * square brackets `[]`, the typical indicators of JSON objects and arrays.
 */
export function maybeJson(parameter: string): boolean {
  return (
    (parameter.startsWith('{') && parameter.endsWith('}')) ||
    (parameter.startsWith('[') && parameter.endsWith(']'))
  )
}

/**
 * Determines whether a given parameter should be skipped during transformation.
 *
 * Skipped when it is `undefined`, `null`, a `bigint`, a `number`, or an object
 * that exposes a `buffer` property (e.g. a typed array / Buffer).
 */
export function skipTransform(parameter: unknown): boolean {
  return (
    parameter === undefined ||
    parameter === null ||
    typeof parameter === 'bigint' ||
    typeof parameter === 'number' ||
    (typeof parameter === 'object' && 'buffer' in parameter)
  )
}

export class BaseSerializePlugin implements KyselyPlugin {
  private readonly transformer: SerializeParametersTransformer
  private readonly deserializer: Deserializer
  private readonly skipNodeSet?: Set<RootOperationNode['kind']>
  private readonly ctx?: WeakSet<QueryId>

  /**
   * Base class for {@link SerializePlugin}, without default options.
   */
  constructor(
    serializer: Serializer,
    deserializer: Deserializer,
    skipNodeKind: Array<RootOperationNode['kind']>
  ) {
    this.transformer = new SerializeParametersTransformer(serializer)
    this.deserializer = deserializer
    if (skipNodeKind.length) {
      this.skipNodeSet = new Set(skipNodeKind)
      this.ctx = new WeakSet()
    }
  }

  transformQuery({
    node,
    queryId,
  }: PluginTransformQueryArgs): RootOperationNode {
    if (this.skipNodeSet?.has(node.kind)) {
      this.ctx?.add(queryId)
      return node
    }
    return this.transformer.transformNode(node)
  }

  async transformResult({
    result,
    queryId,
  }: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return this.ctx?.has(queryId)
      ? result
      : { ...result, rows: this.parseRows(result.rows) }
  }

  private parseRows(rows: UnknownRow[]): UnknownRow[] {
    const result: UnknownRow[] = []
    for (const row of rows) {
      if (!row) {
        continue
      }
      const parsedRow: UnknownRow = {}
      for (const [key, value] of Object.entries(row)) {
        parsedRow[key] = this.deserializer(value)
      }
      result.push(parsedRow)
    }
    return result
  }
}

export interface SerializePluginOptions {
  /**
   * serialize params
   */
  serializer?: Serializer
  /**
   * deserialize params
   */
  deserializer?: Deserializer
  /**
   * node kind to skip transform
   */
  skipNodeKind?: Array<RootOperationNode['kind']>
}

export class SerializePlugin extends BaseSerializePlugin {
  /**
   * _**THIS PLUGIN SHOULD BE PLACED AT THE END OF PLUGINS ARRAY !!!**_
   *
   * reference from https://github.com/koskimas/kysely/pull/138
   *
   * Serializes object/array/Date/boolean column values to strings for
   * SQLite-style dialects and deserializes them on the way back out. Pass a
   * custom `serializer`/`deserializer` to override the default behaviour.
   */
  constructor(options: SerializePluginOptions = {}) {
    const {
      deserializer = defaultDeserializer,
      serializer = defaultSerializer,
      skipNodeKind = [],
    } = options
    super(serializer, deserializer, skipNodeKind)
  }
}

/**
 * @deprecated use {@link SerializePlugin} instead
 */
export const SqliteSerializePlugin = SerializePlugin
