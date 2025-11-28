import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'

/**
 * Extract input type from a PikkuFunc
 */
export type InputType<F> =
  F extends CorePikkuFunctionConfig<infer Func, any, any, any, any>
    ? Func extends (services: any, data: infer I, wire: any) => any
      ? I
      : never
    : never

/**
 * Extract output type from a PikkuFunc
 */
export type OutputType<F> =
  F extends CorePikkuFunctionConfig<infer Func, any, any, any, any>
    ? Func extends (services: any, data: any, wire: any) => Promise<infer O>
      ? O
      : never
    : never

/**
 * Ref value - internal representation after input callback is evaluated
 */
export interface RefValue {
  __isRef: true
  nodeId: string
  path?: string
}

/**
 * Helper to create a ref value
 */
export const createRef = (nodeId: string, path?: string): RefValue => ({
  __isRef: true,
  nodeId,
  path,
})

/**
 * Check if a value is a ref
 */
export const isRef = (value: unknown): value is RefValue =>
  typeof value === 'object' &&
  value !== null &&
  '__isRef' in value &&
  (value as RefValue).__isRef === true

/**
 * Input reference for fetching step results
 */
export interface InputRef {
  nodeId: string
  path?: string
}

/**
 * Ref function type - provides type-safe references to other nodes' outputs
 * The actual typing is done at the wireWorkflowGraph level
 */
export type RefFn<NodeIds extends string = string> = (
  nodeId: NodeIds,
  path?: string
) => RefValue

/**
 * Input mapping - each key can be a literal value OR a ref
 */
export type InputMapping<T> = {
  [K in keyof T]-?: T[K] | RefValue
}

/**
 * Next node configuration - fully serializable
 * - string: single next node
 * - string[]: parallel execution (all run concurrently)
 * - Record<string, string | string[]>: branching (function calls graph.branch('key'))
 */
export type NextConfig<NodeIds extends string = string> =
  | NodeIds
  | NodeIds[]
  | Record<string, NodeIds | NodeIds[]>

/**
 * Graph node configuration returned by graphNode()
 */
export interface GraphNodeConfig<
  Func extends CorePikkuFunctionConfig<
    any,
    any,
    any,
    any,
    any
  > = CorePikkuFunctionConfig<any, any, any, any, any>,
  NodeIds extends string = string,
> {
  /** The pikku function */
  func: Func
  /** Input mapping callback - receives ref function, returns input mapping */
  input?: (ref: RefFn<NodeIds>) => InputMapping<InputType<Func>>
  /** Next nodes - string, array, or record for branching */
  next?: NextConfig<NodeIds>
  /** Error routing - only valid if function has errorOutput */
  onError?: NodeIds | NodeIds[]
}

/**
 * Trigger configuration for HTTP
 */
export interface HTTPTriggerConfig {
  route: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
}

/**
 * Trigger configuration for workflows
 */
export interface WorkflowGraphTriggers {
  http?: HTTPTriggerConfig
  queue?: string
  // Future: channel, cli, schedule, subscription
}

/**
 * Workflow graph definition
 */
export interface WorkflowGraphDefinition<
  Nodes extends Record<
    string,
    GraphNodeConfig<any, Extract<keyof Nodes, string>>
  > = Record<string, GraphNodeConfig>,
> {
  /** Unique workflow name */
  name: string
  /** Trigger configuration */
  triggers: WorkflowGraphTriggers
  /** Graph nodes */
  graph: Nodes
}

/**
 * Serialized graph node for runtime/storage
 * This is what gets stored after input callbacks are evaluated
 */
export interface SerializedGraphNode {
  /** Node ID */
  nodeId: string
  /** RPC function name */
  rpcName: string
  /** Resolved input mapping with refs */
  input: Record<string, unknown | RefValue>
  /**
   * Next node configuration (fully serializable)
   * - string: single next node
   * - string[]: parallel execution
   * - Record<string, string | string[]>: branching (requires graph.branch() call)
   */
  next?: string | string[] | Record<string, string | string[]>
  /** Error routing */
  onError?: string | string[]
}

/**
 * Serialized workflow graph for runtime/storage
 */
export interface SerializedWorkflowGraph {
  /** Workflow name */
  name: string
  /** Triggers */
  triggers: WorkflowGraphTriggers
  /** Serialized nodes */
  nodes: Record<string, SerializedGraphNode>
  /** Entry node ID */
  entryNodeId: string
}

/**
 * Workflow graph metadata for inspector
 */
export interface WorkflowGraphMeta {
  /** Workflow name */
  workflowName: string
  /** Trigger configuration */
  triggers: WorkflowGraphTriggers
  /** Node metadata */
  nodes: Record<
    string,
    {
      rpcName: string
      inputRefs: InputRef[]
      next?: string | string[] | Record<string, string | string[]>
      onError?: string | string[]
    }
  >
  /** Entry node ID */
  entryNodeId: string
  /** Optional tags for organization */
  tags?: string[]
  /** Optional description */
  description?: string
}

/**
 * All workflow graphs metadata
 */
export type WorkflowGraphsMeta = Record<string, WorkflowGraphMeta>

/**
 * Graph wire context - available to functions running in a workflow graph
 */
export interface PikkuGraphWire {
  /** Workflow run ID */
  runId: string
  /** Graph name */
  graphName: string
  /** Current node ID */
  nodeId: string
  /**
   * Select which branch to take for Record-based next config.
   * Must be called if the node has a Record `next` configuration.
   * @param key - The branch key to take (must match a key in the next Record)
   */
  branch: (key: string) => void
}

/**
 * Internal mutable state for graph wire (used by runner to capture branch)
 */
export interface GraphWireState {
  branchKey?: string
}
