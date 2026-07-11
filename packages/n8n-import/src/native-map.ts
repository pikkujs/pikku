/**
 * Declarative mapping of n8n node types onto @pikku/addon-graph functions whose
 * contract is a plain single-value transform — the input is assembled by a 1:1
 * field mapping (n8n param → addon input field), each value lowered like any
 * other expression (ref / template / literal).
 *
 * Array-stream transforms (aggregate / merge / limit / sort …) are intentionally
 * absent: their addon contract takes an `items` array fed from a pathless
 * predecessor ref, which the graph's typed-ref model can't express yet.
 */

/** One addon input field sourced from an n8n parameter. */
export interface NativeFieldSpec {
  /** n8n parameter key(s); the first present value wins. */
  from?: string | string[]
  /**
   * Source the whole output of the node's data predecessor as this field —
   * `ref(predecessorNodeId)`. This is how n8n's implicit incoming item stream
   * maps onto an array-transform addon's `items` input.
   */
  fromPredecessor?: boolean
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
}

export function nativeSpecFor(typeShort: string): NativeNodeSpec | undefined {
  return NATIVE_NODES[typeShort.toLowerCase()]
}
