/**
 * Declarative mapping of n8n node types onto @pikku/addon-graph functions whose
 * contract is a plain single-value transform — the input is assembled by a 1:1
 * field mapping (n8n param → addon input field), each value lowered like any
 * other expression (ref / template / literal).
 *
 * Array-stream transforms (aggregate / limit / sort …) feed their `items`/`item`
 * input from a pathless predecessor ref (`fromPredecessor`), and their per-row
 * config from n8n `fixedCollection`s (`fromCollection`). `merge` stays absent —
 * n8n Merge is graph topology (multiple inputs join a node), not a transform.
 */

import { integrationSpecFor } from './integration-map.js'

/** One addon input field sourced from an n8n parameter. */
export interface NativeFieldSpec {
  /** n8n parameter key(s); the first present value wins. */
  from?: string | string[]
  /**
   * n8n resource-locator parameter key(s) — reads the locator's `.value`
   * (a literal id, a URL, or an `={{…}}` expression) rather than the whole
   * `{ __rl, mode, value }` wrapper. First present locator wins.
   */
  fromRL?: string | string[]
  /**
   * Source the whole output of the node's data predecessor as this field —
   * `ref(predecessorNodeId)`. This is how n8n's implicit incoming item stream
   * maps onto an array-transform addon's `items` input.
   */
  fromPredecessor?: boolean
  /**
   * Source an array of refs to ALL graph-node predecessors — the multiple input
   * streams that feed a join node (n8n Merge → `[ref(a), ref(b), …]`). Emits
   * nothing when the node has no graph predecessors.
   */
  fromAllPredecessors?: boolean
  /**
   * Source a single property of the data predecessor's item — `ref(predId,
   * <path>)` — where the property name is read from the n8n parameter `param`
   * (n8n's `dataPropertyName` idiom: the field on the incoming item that holds
   * the string a text node operates on). Falls back to `default` when the param
   * is absent or an expression rather than a plain property path.
   */
  fromPredecessorPath?: { param: string; default: string }
  /** Source this node's own graph id as a string literal (e.g. a step name). */
  fromNodeId?: boolean
  /**
   * Source this field from an n8n `fixedCollection` — the nested `{ outer: {
   * inner: [ … ] } }` shape n8n uses for repeatable config rows (sort fields,
   * key-rename pairs, summarize aggregations). `path` is the dot-path to the
   * inner array. With `map`, each row is projected into an object (addon key →
   * n8n row key, optionally remapping enum values); with `pick`, each row
   * contributes a single scalar (`first` keeps only the first row's value).
   */
  fromCollection?: {
    /** Dot-path to the inner array, e.g. `sortFieldsUi.sortField`. */
    path: string
    /** Project each row into an object: addon key → n8n row key or `{ from, values }`. */
    map?: Record<
      string,
      string | { from: string; values?: Record<string, string> }
    >
    /** Or pick one scalar per row (→ an array, or a single value with `first`). */
    pick?: string
    /** With `pick`, keep only the first row's scalar. */
    first?: boolean
  }
  /**
   * Remap the resolved string value through this table before emitting — for
   * n8n→addon enum translation (e.g. n8n dateTime `addToDate` → addon `add`,
   * crypto `SHA256` → `sha256`). A value absent from the table passes through
   * unchanged. Applies to `from` / `fromRL` scalar sources.
   */
  values?: Record<string, string>
  /** Fallback when none of the source keys are present. */
  default?: unknown
  /** Preserve a string literal's enum type (`"x" as const`) rather than widen. */
  asConst?: boolean
}

export interface NativeNodeSpec {
  /** The @pikku/addon-graph RPC name, e.g. `graph:stopAndError`. */
  rpc: string
  /** addon input field → n8n source parameter. */
  fields: Record<string, NativeFieldSpec>
  /**
   * Guard: only treat the node as this native mapping when it returns true.
   * Used when a single n8n node type has modes we can't all map (e.g. Wait's
   * non-interval resume modes).
   */
  applies?: (parameters: Record<string, unknown>) => boolean
}

const NATIVE_NODES: Record<string, NativeNodeSpec> = {
  stopanderror: {
    rpc: 'graph:stopAndError',
    fields: {
      message: {
        from: ['errorMessage', 'message'],
        default: 'Workflow stopped',
      },
    },
  },
  limit: {
    rpc: 'graph:limit',
    fields: {
      items: { fromPredecessor: true },
      limit: { from: 'maxItems', default: 1 },
    },
  },
  splitout: {
    rpc: 'graph:splitOut',
    fields: {
      item: { fromPredecessor: true },
      field: { from: 'fieldToSplitOut', default: '' },
    },
  },
  removeduplicates: {
    rpc: 'graph:removeDuplicates',
    fields: {
      items: { fromPredecessor: true },
      fields: { default: [] },
    },
  },
  wait: {
    rpc: 'graph:wait',
    // Only the interval mode maps cleanly; webhook / specific-time resumes are
    // a different shape and stay a stub (addon-map territory).
    applies: (p) =>
      p.resume === undefined ||
      p.resume === 'timeInterval' ||
      p.resume === 'interval',
    fields: {
      name: { fromNodeId: true },
      amount: { from: 'amount', default: 1 },
      unit: { from: 'unit', default: 'seconds', asConst: true },
    },
  },
  sort: {
    rpc: 'graph:sort',
    // Only the simple field-sort maps; random / code sorts are a different shape.
    applies: (p) => p.type === undefined || p.type === 'simple',
    fields: {
      items: { fromPredecessor: true },
      sortBy: {
        fromCollection: {
          path: 'sortFieldsUi.sortField',
          map: {
            field: 'fieldName',
            order: {
              from: 'order',
              values: { ascending: 'asc', descending: 'desc' },
            },
          },
        },
      },
    },
  },
  renamekeys: {
    rpc: 'graph:renameKeys',
    fields: {
      item: { fromPredecessor: true },
      mappings: {
        fromCollection: {
          path: 'keys.key',
          map: { oldKey: 'currentKey', newKey: 'newKey' },
        },
      },
    },
  },
  aggregate: {
    rpc: 'graph:aggregate',
    // n8n's default "aggregate individual fields" mode maps 1:1 onto
    // graph:aggregate's `fields` (each row → one collected output field). The
    // `aggregateAllItemData` mode (collect whole items) is a different shape →
    // stays a stub.
    applies: (p) => {
      const mode = p.aggregate as string | undefined
      if (mode && mode !== 'aggregateIndividualFields') return false
      const rows = (p.fieldsToAggregate as { fieldToAggregate?: unknown })
        ?.fieldToAggregate
      return Array.isArray(rows) && rows.length >= 1
    },
    fields: {
      items: { fromPredecessor: true },
      fields: {
        fromCollection: {
          path: 'fieldsToAggregate.fieldToAggregate',
          map: { field: 'fieldToAggregate', outputField: 'outputFieldName' },
        },
      },
    },
  },
  summarize: {
    rpc: 'graph:summarize',
    // append / concatenate have no addon equivalent — only map when every
    // aggregation is one the addon supports.
    applies: (p) => {
      const rows = (p.fieldsToSummarize as { values?: unknown })?.values
      if (!Array.isArray(rows) || rows.length === 0) return false
      const supported = new Set([
        'sum',
        'average',
        'count',
        'countUnique',
        'min',
        'max',
      ])
      return rows.every((r) =>
        supported.has((r as { aggregation?: string })?.aggregation as string)
      )
    },
    fields: {
      items: { fromPredecessor: true },
      aggregations: {
        fromCollection: {
          path: 'fieldsToSummarize.values',
          map: {
            field: 'field',
            operation: {
              from: 'aggregation',
              values: { average: 'avg', countUnique: 'countDistinct' },
            },
            outputField: 'field',
          },
        },
      },
    },
  },
  datetime: {
    rpc: 'graph:dateTime',
    // Both n8n versions map onto the one graph:dateTime — v1 (`action`
    // format/calculate + `operation` add/subtract) and v2 (`operation`
    // addToDate/subtractFromDate/formatDate/getTimeBetweenDates) — via
    // first-present-key sourcing + an operation value-map. roundDate stays a
    // stub (its addon op depends on the sibling `mode` field, not the op name).
    applies: (p) => {
      const op = (p.operation ?? p.action) as string | undefined
      return (
        op === undefined ||
        [
          'add',
          'subtract',
          'calculate',
          'format',
          'addToDate',
          'subtractFromDate',
          'formatDate',
          'getCurrentDate',
          'getTimeBetweenDates',
          'extractDate',
        ].includes(op)
      )
    },
    fields: {
      operation: {
        from: ['operation', 'action'],
        values: {
          add: 'add',
          subtract: 'subtract',
          addToDate: 'add',
          subtractFromDate: 'subtract',
          format: 'format',
          formatDate: 'format',
          getCurrentDate: 'now',
          getTimeBetweenDates: 'diff',
          extractDate: 'extract',
        },
        default: 'now',
        asConst: true,
      },
      value: { from: ['value', 'magnitude', 'date', 'startDate'] },
      amount: { from: 'duration' },
      // n8n's diff `units` is a multi-select array (wrong shape for the addon's
      // single-enum `unit`); only the add/subtract scalar `timeUnit` maps.
      unit: { from: 'timeUnit', asConst: true },
      format: { from: ['toFormat', 'format'] },
      compareWith: { from: 'endDate' },
      // extractDate: n8n's `part` (year/month/week/day/…) → addon `part`.
      part: { from: 'part', asConst: true },
    },
  },
  crypto: {
    rpc: 'graph:crypto',
    // n8n Crypto is v1-only in practice. `sign` (RSA) and binary-file input
    // have no addon equivalent → stay stubs.
    applies: (p) =>
      p.binaryData !== true &&
      (p.action === undefined ||
        ['generate', 'hash', 'hmac'].includes(p.action as string)),
    fields: {
      operation: {
        from: 'action',
        values: { generate: 'uuid', hash: 'hash', hmac: 'hmac' },
        default: 'hash',
        asConst: true,
      },
      data: { from: 'value' },
      algorithm: {
        from: 'type',
        values: {
          MD5: 'md5',
          SHA1: 'sha1',
          SHA256: 'sha256',
          SHA384: 'sha384',
          SHA512: 'sha512',
        },
        asConst: true,
      },
      key: { from: 'secret' },
      encoding: { from: 'encoding', asConst: true },
    },
  },
}

// n8n's legacy Item Lists node is a multiplexer over the same array transforms
// that later became standalone nodes — and it carries the identical parameter
// shapes (fieldToSplitOut, sortFieldsUi.sortField, fieldsToAggregate, …). So an
// itemLists op delegates straight to the standalone spec, reusing its field map
// and `applies` guard. `concatenateItems` has no standalone equivalent → stub.
const ITEMLISTS_OP_TO_TYPE: Record<string, string> = {
  splitOutItems: 'splitout',
  removeDuplicates: 'removeduplicates',
  sort: 'sort',
  limit: 'limit',
  summarize: 'summarize',
  aggregateItems: 'aggregate',
}

export function nativeSpecFor(
  typeShort: string,
  parameters?: Record<string, unknown>
): NativeNodeSpec | undefined {
  if (typeShort.toLowerCase() === 'itemlists') {
    const op = (parameters?.operation as string) ?? 'splitOutItems'
    const target = ITEMLISTS_OP_TO_TYPE[op]
    return target ? nativeSpecFor(target, parameters) : undefined
  }
  const spec = NATIVE_NODES[typeShort.toLowerCase()]
  if (spec) {
    if (spec.applies && parameters && !spec.applies(parameters))
      return undefined
    return spec
  }
  // Fall through to the per-service integration addons (google-drive, …),
  // resolved by the node's resource/operation.
  return integrationSpecFor(typeShort, parameters)
}
