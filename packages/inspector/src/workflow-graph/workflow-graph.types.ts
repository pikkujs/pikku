/**
 * Serialized types for workflow graphs
 * These are extracted by the inspector and stored as JSON
 * Can be created from code (wireWorkflowGraph) or UI
 */

/**
 * Reference to data from another node or trigger
 */
export interface DataRef {
  /** Source: 'trigger' for trigger input, or node ID for node output */
  $ref: string
  /** Optional path into the data (dot notation: 'body.orderId') */
  path?: string
}

/**
 * Check if value is a DataRef
 */
export const isDataRef = (value: unknown): value is DataRef =>
  typeof value === 'object' &&
  value !== null &&
  '$ref' in value &&
  typeof (value as DataRef).$ref === 'string'

/**
 * Condition for branching
 */
export interface BranchCondition {
  /** Expression to evaluate (uses node output references) */
  expression: string
  /** Target node(s) if condition is true */
  target: string | string[]
}

/**
 * Next node configuration
 */
export type SerializedNext =
  | string // Single next node
  | string[] // Parallel execution
  | {
      /** Conditions evaluated in order, first match wins */
      conditions: BranchCondition[]
      /** Default target if no conditions match */
      default?: string | string[]
    }

/**
 * Node execution options
 */
export interface NodeOptions {
  /** Number of retry attempts on failure */
  retries?: number
  /** Delay between retries (e.g., '1s', '5s') */
  retryDelay?: string
  /** Timeout for node execution (e.g., '30s', '5m') */
  timeout?: string
  /** If true, execute via queue (async). Default: false (inline) */
  async?: boolean
}

/**
 * Serialized graph node
 */
export interface SerializedGraphNode {
  /** Node ID */
  nodeId: string
  /** RPC function name */
  rpcName: string
  /** Input mapping - values can be literals or DataRefs */
  input: Record<string, unknown | DataRef>
  /** Next node(s) - simple, parallel, or conditional */
  next?: SerializedNext
  /** Error routing - node(s) to execute on error */
  onError?: string | string[]
  /** Execution options */
  options?: NodeOptions
}

/**
 * HTTP trigger configuration
 */
export interface HTTPTriggerConfig {
  route: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
}

/**
 * Trigger configuration
 */
export interface WorkflowGraphTriggers {
  http?: HTTPTriggerConfig
  queue?: string
  schedule?: string
}

/**
 * Serialized workflow graph - the canonical JSON format
 */
export interface SerializedWorkflowGraph {
  /** Workflow name */
  name: string
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Triggers - how the workflow is started */
  triggers: WorkflowGraphTriggers
  /** Serialized nodes */
  nodes: Record<string, SerializedGraphNode>
  /** Entry node(s) - first nodes to execute */
  entryNodeIds: string[]
}

/**
 * All workflow graphs (serialized)
 */
export type SerializedWorkflowGraphs = Record<string, SerializedWorkflowGraph>
