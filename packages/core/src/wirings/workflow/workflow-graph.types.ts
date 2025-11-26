/**
 * WorkflowGraph types for cyclic graph-based workflows.
 * pikkuWorkflowGraph enables n8n-like visual workflow capabilities
 * while maintaining TypeScript type safety via wireForgeNode metadata.
 */

/**
 * Input value for a node instance - either a literal or a reference path
 */
export type InputValue =
  | { type: 'literal'; value: unknown }
  | { type: 'ref'; path: string } // e.g., 'createOrg_1.output.orgId'

/**
 * A node instance in a WorkflowGraph.
 * References a node defined via wireForgeNode and specifies inputs/flow.
 */
export interface WorkflowGraphNodeInstance {
  /**
   * Reference to wireForgeNode (namespaced: '@package:nodeName')
   * Uses the same namespace resolver as core for RPC calling.
   */
  nodeId: string

  /**
   * Input values - either literal or reference to another node's output.
   * Keys are input field names from the node's inputSchemaName.
   */
  input: Record<string, InputValue>

  /**
   * What to run after this node completes. Implies dependency.
   * - string: Single next instance
   * - string[]: Parallel execution (all run concurrently)
   * - Record<string, string | string[]>: Branching (node calls graph.branch() to select)
   */
  next?: string | string[] | Record<string, string | string[]>

  /**
   * Error handling - where to route on error.
   * Only valid if wireForgeNode.errorOutput is true.
   * Can be string or string[] for parallel error handlers.
   */
  onError?: string | string[]

  /**
   * Maximum iterations for this instance (prevents infinite loops).
   * Default: 100
   */
  maxIterations?: number
}

/**
 * A complete workflow graph - a record of node instances keyed by instance ID.
 * Instance IDs are unique within the workflow (e.g., 'createOrg_1', 'sendEmail_2').
 */
export type WorkflowGraph = Record<string, WorkflowGraphNodeInstance>

/**
 * Graph context available to functions executing within a workflow graph.
 * Passed via the wire (third) parameter.
 *
 * @template TBranches - Union of valid branch names (defaults to never for non-branching)
 */
export interface GraphContext<TBranches extends string = never> {
  /**
   * Select which branch to take (for branching nodes).
   * Only valid when next is a Record<string, ...>.
   * Branch name must match a key in the node's next configuration.
   */
  branch: (name: TBranches) => void

  /**
   * Current iteration count for this node instance.
   * Starts at 0, increments each time the node re-executes in a cycle.
   */
  iteration: number
}

/**
 * Result of executing a node instance
 */
export interface NodeExecutionResult {
  /** The instance ID that was executed */
  instanceId: string
  /** Iteration number for this execution */
  iteration: number
  /** Output data from the node (if successful) */
  output?: unknown
  /** Error (if failed) */
  error?: Error
  /** Branch selected by the node (if any) */
  selectedBranch?: string
}

/**
 * Execution state for a workflow graph run
 */
export interface WorkflowGraphRunState {
  /** Unique run ID */
  runId: string
  /** The workflow graph being executed */
  graph: WorkflowGraph
  /** Current iteration count per instance */
  iterations: Map<string, number>
  /** Completed instance results (keyed by instanceId, stores latest result) */
  completed: Map<string, NodeExecutionResult>
  /** Instances currently executing */
  executing: Set<string>
  /** Overall workflow status */
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  /** Workflow input (from trigger) */
  input: unknown
  /** Final output (if completed) */
  output?: unknown
  /** Error (if failed) */
  error?: Error
}

/**
 * Options for WorkflowGraph execution
 */
export interface WorkflowGraphExecutionOptions {
  /** Global maximum iterations per instance (overrides instance-level) */
  maxIterations?: number
  /** Global execution timeout in milliseconds */
  timeout?: number
  /** Global error handler instance ID */
  globalErrorHandler?: string
}

/**
 * Validation error for workflow graphs
 */
export interface WorkflowGraphValidationError {
  /** Type of validation error */
  type:
    | 'missing_trigger'
    | 'invalid_node_id'
    | 'missing_required_input'
    | 'invalid_path_ref'
    | 'invalid_next_target'
    | 'invalid_on_error'
    | 'missing_branch_coverage'
    | 'cycle_detected'
  /** Instance ID where error occurred */
  instanceId: string
  /** Human-readable error message */
  message: string
  /** Additional context */
  details?: Record<string, unknown>
}

/**
 * Result of validating a workflow graph
 */
export interface WorkflowGraphValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** List of errors (if any) */
  errors: WorkflowGraphValidationError[]
  /** List of warnings (non-blocking issues) */
  warnings: WorkflowGraphValidationError[]
}
