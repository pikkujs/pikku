import type {
  GraphNodeConfig,
  NextConfig,
  RefValue,
} from './workflow-graph.types.js'

/**
 * Standard RPC handler interface (matches generated FlattenedRPCMap entries)
 */
export interface RPCHandler<I = any, O = any> {
  input: I
  output: O
}

/**
 * Compute output types for all nodes based on their func (RPC name)
 */
export type NodeOutputMap<
  Nodes extends Record<string, { func: string }>,
  RPCMap extends Record<string, RPCHandler>,
> = {
  [K in keyof Nodes]: Nodes[K]['func'] extends keyof RPCMap
    ? RPCMap[Nodes[K]['func']]['output']
    : unknown
}

/**
 * Node definition with RPC name reference
 */
export interface GraphNodeDef<
  RPCMap extends Record<string, RPCHandler>,
  NodeIds extends string = string,
  NodeOutputs extends Record<string, any> = Record<string, any>,
> {
  /** RPC function name (must be a key in RPCMap) */
  func: keyof RPCMap & string
  /** Input mapping - reference outputs from other nodes with autocomplete */
  input?: (
    ref: <N extends keyof NodeOutputs & string>(
      nodeId: N,
      path: keyof NodeOutputs[N] & string
    ) => RefValue
  ) => Record<string, unknown>
  /** Next node(s) to execute */
  next?: NextConfig<NodeIds>
  /** Error handling - node(s) to execute on error */
  onError?: NodeIds | NodeIds[]
}

/**
 * Helper to create a type-safe graph definition with RPC autocomplete.
 * Pass node IDs as first type parameter for type-safe next/ref/output key completion.
 *
 * @example
 * ```typescript
 * // Import the typed graph from generated types
 * import { graph } from './.pikku/workflow/pikku-workflow-graph-types.gen.js'
 *
 * wireWorkflowGraph({
 *   name: 'myWorkflow',
 *   triggers: { http: { route: '/start', method: 'post' } },
 *   graph: graph<'entry' | 'sendWelcome'>()({
 *     entry: {
 *       func: 'createUserProfile',  // autocompletes RPC names
 *       next: 'sendWelcome',
 *     },
 *     sendWelcome: {
 *       func: 'sendEmail',
 *       input: (ref) => ({
 *         to: ref('entry', 'email'),  // 'entry' and 'email' both autocomplete
 *       }),
 *     },
 *   }),
 * })
 * ```
 */
/**
 * Type to compute output types for all nodes based on their func mapping
 */
type ComputeNodeOutputs<
  FuncMap extends Record<string, string>,
  RPCMap extends Record<string, RPCHandler>,
> = {
  [K in keyof FuncMap]: FuncMap[K] extends keyof RPCMap
    ? RPCMap[FuncMap[K]]['output']
    : unknown
}

/**
 * Type to compute input types for all nodes based on their func mapping
 */
type ComputeNodeInputs<
  FuncMap extends Record<string, string>,
  RPCMap extends Record<string, RPCHandler>,
> = {
  [K in keyof FuncMap]: FuncMap[K] extends keyof RPCMap
    ? RPCMap[FuncMap[K]]['input']
    : unknown
}

/**
 * Typed ref value - carries the type of the referenced field as a phantom type.
 * At runtime this is just RefValue, but TypeScript tracks the type T.
 */
export type TypedRef<T> = RefValue & { __phantomType?: T }

/**
 * Map input type fields to allow TypedRef of matching type as an alternative
 */
type InputWithRefs<T> = {
  [K in keyof T]: T[K] | TypedRef<T[K]>
}

export function createGraph<RPCMap extends Record<string, RPCHandler>>() {
  return <const FuncMap extends Record<string, keyof RPCMap & string>>(
    funcMap: FuncMap
  ) => {
    type NodeIds = Extract<keyof FuncMap, string>
    type NodeOutputs = ComputeNodeOutputs<FuncMap, RPCMap>
    type NodeInputs = ComputeNodeInputs<FuncMap, RPCMap>

    type NodeConfig = {
      [K in NodeIds]: {
        next?: NextConfig<NodeIds>
        input?: (
          ref: <N extends NodeIds, P extends keyof NodeOutputs[N] & string>(
            nodeId: N,
            path: P
          ) => TypedRef<NodeOutputs[N][P]>
        ) => InputWithRefs<NodeInputs[K]>
        onError?: NodeIds | NodeIds[]
      }
    }

    // Support both direct object and callback syntax
    return (
      nodesOrBuilder: NodeConfig | ((nodes: FuncMap) => NodeConfig)
    ): Record<NodeIds, GraphNodeConfig<NodeIds>> => {
      const nodes =
        typeof nodesOrBuilder === 'function'
          ? nodesOrBuilder(funcMap)
          : nodesOrBuilder

      const result: Record<string, GraphNodeConfig<string>> = {}

      for (const [nodeId, def] of Object.entries(nodes) as [string, any][]) {
        result[nodeId] = {
          func: funcMap[nodeId] as string,
          input: def.input as any,
          next: def.next,
          onError: def.onError,
        }
      }

      return result as Record<NodeIds, GraphNodeConfig<NodeIds>>
    }
  }
}

/**
 * Untyped graph for use without RPC map.
 * Pass node IDs as type parameter for type-safe next/ref, or omit for untyped usage.
 *
 * @example
 * ```typescript
 * // Typed usage - next and ref are type-checked
 * graph<'entry' | 'sendWelcome'>({
 *   entry: { func: 'createUserProfile', next: 'sendWelcome' },
 *   sendWelcome: { func: 'sendEmail', input: (ref) => ({ to: ref('entry', 'email') }) },
 * })
 *
 * // Untyped usage - no type checking on next/ref
 * graph({
 *   entry: { func: 'createUserProfile', next: 'sendWelcome' },
 *   sendWelcome: { func: 'sendEmail' },
 * })
 * ```
 */
export function graph<NodeIds extends string = string>(
  nodes: Record<
    NodeIds,
    {
      func: string
      next?: NextConfig<NodeIds>
      input?: (
        ref: (nodeId: NodeIds, path: string) => RefValue
      ) => Record<string, unknown>
      onError?: NodeIds | NodeIds[]
    }
  >
): Record<NodeIds, GraphNodeConfig<NodeIds>> {
  const result: Record<string, GraphNodeConfig<string>> = {}

  for (const [nodeId, def] of Object.entries(nodes) as [string, any][]) {
    result[nodeId] = {
      func: def.func,
      input: def.input as any,
      next: def.next,
      onError: def.onError,
    }
  }

  return result as Record<NodeIds, GraphNodeConfig<NodeIds>>
}
