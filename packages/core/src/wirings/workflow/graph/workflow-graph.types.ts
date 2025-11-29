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
 * Graph node configuration - references functions by RPC name
 */
export interface GraphNodeConfig<NodeIds extends string = string> {
  /** RPC function name */
  func: string
  /** Input mapping callback - receives ref function, returns input object */
  input?: (ref: RefFn<NodeIds>) => Record<string, unknown>
  /** Next nodes - string, array, or record for branching */
  next?: NextConfig<NodeIds>
  /** Error routing - node(s) to execute on error */
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
  Nodes extends Record<string, GraphNodeConfig<string>> = Record<
    string,
    GraphNodeConfig
  >,
> {
  /** Unique workflow name */
  name: string
  /** Trigger configuration */
  triggers: WorkflowGraphTriggers
  /** Graph nodes */
  graph: Nodes
}

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
