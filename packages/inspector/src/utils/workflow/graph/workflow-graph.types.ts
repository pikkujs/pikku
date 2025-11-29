/**
 * Serialized types for workflow graphs
 * These are extracted by the inspector and stored as JSON
 * Can be created from code (wireWorkflow) or UI
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
 * HTTP wire configuration with startNode
 */
export interface HttpWire {
  route: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  startNode: string
}

/**
 * Channel wire configuration
 */
export interface ChannelWire {
  name: string
  onConnect?: string
  onDisconnect?: string
  onMessage?: string
}

/**
 * Queue wire configuration
 */
export interface QueueWire {
  name: string
  startNode: string
}

/**
 * CLI wire configuration
 */
export interface CliWire {
  command: string
  startNode: string
}

/**
 * MCP wire configurations
 */
export interface McpWires {
  tool?: Array<{ name: string; startNode: string }>
  prompt?: Array<{ name: string; startNode: string }>
  resource?: Array<{ uri: string; startNode: string }>
}

/**
 * Schedule wire configuration
 */
export interface ScheduleWire {
  cron?: string
  interval?: string
  startNode: string
}

/**
 * Trigger wire configuration
 */
export interface TriggerWire {
  name: string
  startNode: string
}

/**
 * All wire configurations for workflows
 */
export interface WorkflowWiresConfig {
  http?: HttpWire[]
  channel?: ChannelWire[]
  queue?: QueueWire[]
  cli?: CliWire[]
  mcp?: McpWires
  schedule?: ScheduleWire[]
  trigger?: TriggerWire[]
}

/**
 * Workflow source type
 */
export type WorkflowSourceType = 'dsl' | 'graph'

/**
 * Serialized workflow graph - the canonical JSON format
 */
export interface SerializedWorkflowGraph {
  /** Workflow name */
  name: string
  /** Pikku function name (for runtime registration) */
  pikkuFuncName: string
  /** Source type: 'dsl' for pikkuWorkflowFunc, 'graph' for pikkuWorkflowGraph */
  source: WorkflowSourceType
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Wires - how the workflow is triggered */
  wires: WorkflowWiresConfig
  /** Serialized nodes */
  nodes: Record<string, SerializedGraphNode>
  /** Entry node(s) - first nodes to execute */
  entryNodeIds: string[]
}

/**
 * All workflow graphs (serialized)
 */
export type SerializedWorkflowGraphs = Record<string, SerializedWorkflowGraph>
