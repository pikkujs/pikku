/**
 * Serialized types for workflow graphs
 * These are extracted by the inspector and stored as JSON
 * Can be created from code (pikkuWorkflowGraph) or UI
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
 * Reference to a context/state variable
 */
export interface StateRef {
  /** Context variable name */
  $state: string
  /** Optional path into the value (dot notation for nested objects) */
  path?: string
}

/**
 * Check if value is a StateRef
 */
export const isStateRef = (value: unknown): value is StateRef =>
  typeof value === 'object' &&
  value !== null &&
  '$state' in value &&
  typeof (value as StateRef).$state === 'string'

/**
 * Helper functions for building input mappings
 */
export const ref = (nodeId: string, path?: string): DataRef => ({
  $ref: nodeId,
  path,
})
export const state = (name: string, path?: string): StateRef => ({
  $state: name,
  path,
})

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
 * Flow node types for control flow (no RPC call)
 */
export type FlowType =
  | 'sleep'
  | 'branch'
  | 'parallel'
  | 'fanout'
  | 'inline'
  | 'switch'
  | 'filter'
  | 'arrayPredicate'
  | 'return'
  | 'cancel'
  | 'set'

// Import and re-export context types from core
import type { ContextVariable, WorkflowContext } from '@pikku/core/workflow'

export type { ContextVariable, WorkflowContext }

/**
 * Base node properties shared by all node types
 */
interface BaseNode {
  /** Node ID */
  nodeId: string
  /** Step name/description */
  stepName?: string
  /** Next node(s) - simple, parallel, or conditional */
  next?: SerializedNext
  /** Error routing - node(s) to execute on error */
  onError?: string | string[]
  /** Execution options */
  options?: NodeOptions
}

/**
 * Function node - calls an RPC
 */
export interface FunctionNode extends BaseNode {
  /** RPC function name */
  rpcName: string
  /** Input mapping - values can be literals or DataRefs */
  input?: Record<string, unknown | DataRef>
  /** Output variable name for storing result */
  outputVar?: string
}

/**
 * Flow node - control flow only, no RPC call
 */
export interface FlowNode extends BaseNode {
  /** Flow type */
  flow: FlowType
  /** Flow-specific properties */
  [key: string]: unknown
}

/**
 * Serialized graph node - either a function node or flow node
 */
export type SerializedGraphNode = FunctionNode | FlowNode

/**
 * Type guard for function nodes
 */
export const isFunctionNode = (
  node: SerializedGraphNode
): node is FunctionNode => 'rpcName' in node

/**
 * Type guard for flow nodes
 */
export const isFlowNode = (node: SerializedGraphNode): node is FlowNode =>
  'flow' in node

/**
 * Workflow source type
 * - 'dsl': Pure DSL workflow (pikkuWorkflowFunc) - can be round-tripped to code
 * - 'complex': Complex workflow (pikkuWorkflowComplexFunc) - contains inline steps, not serializable
 * - 'graph': Graph-based workflow (pikkuWorkflowGraph)
 */
export type WorkflowSourceType = 'dsl' | 'complex' | 'graph'

/**
 * Serialized workflow graph - the canonical JSON format
 */
export interface SerializedWorkflowGraph {
  /** Workflow name */
  name: string
  /** Pikku function name (for runtime registration) */
  pikkuFuncId: string
  /** Source type: 'dsl' for pikkuWorkflowFunc, 'graph' for pikkuWorkflowGraph */
  source: WorkflowSourceType
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Workflow context/state variables (from Zod schema) */
  context?: WorkflowContext
  /** Serialized nodes */
  nodes: Record<string, SerializedGraphNode>
  /** Entry node(s) - first nodes to execute */
  entryNodeIds: string[]
}

/**
 * All workflow graphs (serialized)
 */
export type SerializedWorkflowGraphs = Record<string, SerializedWorkflowGraph>
