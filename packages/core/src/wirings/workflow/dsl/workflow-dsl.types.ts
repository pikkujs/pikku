/**
 * DSL (Domain Specific Language) workflow types
 * These types define the step-based workflow format extracted by the inspector
 */

import type { WorkflowRun } from '../workflow.types.js'

/**
 * Workflow step options
 */
export interface WorkflowStepOptions {
  /** Display name for logs/UI (optional, doesn't affect execution) */
  description?: string
  /** Number of retry attempts for failed steps (only applies to local execution) */
  retries?: number
  /** Delay between retry attempts (e.g., '1s', '2s', '2min') */
  retryDelay?: string | number
  // Future: timeout, failFast, priority
}

/**
 * Type signature for workflow.do() RPC form - used by inspector
 */
export type WorkflowWireDoRPC = <TOutput = any, TInput = any>(
  stepName: string,
  rpcName: string,
  data: TInput,
  options?: WorkflowStepOptions
) => Promise<TOutput>

/**
 * Type signature for workflow.do() inline form - used by inspector
 */
export type WorkflowWireDoInline = <T>(
  stepName: string,
  fn: () => Promise<T> | T,
  options?: WorkflowStepOptions
) => Promise<T>

/**
 * Type signature for workflow.sleep() - used by inspector
 */
export type WorkflowWireSleep = (
  stepName: string,
  duration: string
) => Promise<void>

/**
 * Type signature for workflow.suspend() - used by inspector
 */
export type WorkflowWireSuspend = (reason: string) => Promise<void>

/**
 * Input source for step arguments in DSL workflows
 */
export type InputSource =
  | { from: 'input'; path: string }
  | { from: 'outputVar'; name: string; path?: string }
  | { from: 'item'; path: string }
  | { from: 'literal'; value: unknown }
  | { from: 'template'; parts: string[]; expressions: InputSource[] }

/**
 * Output binding for return statements in DSL workflows
 */
export type OutputBinding =
  | { from: 'outputVar'; name: string; path?: string }
  | { from: 'stateVar'; name: string; path?: string }
  | { from: 'input'; path: string }
  | { from: 'literal'; value: unknown }
  | { from: 'expression'; expression: string }

/**
 * RPC step metadata (base form)
 */
export interface RpcStepMeta {
  /** RPC form - generates queue worker */
  type: 'rpc'
  /** Cache key (stepName from workflow.do) */
  stepName: string
  /** RPC to invoke */
  rpcName: string
  /** Output variable name (if assigned) */
  outputVar?: string
  /** Input source mappings, or 'passthrough' when entire data is passed */
  inputs?: Record<string, InputSource> | 'passthrough'
  /** Step options */
  options?: WorkflowStepOptions
}

/**
 * Simple condition expression (leaf node)
 */
export interface SimpleCondition {
  type: 'simple'
  expression: string
}

/**
 * Nested condition structure supporting AND/OR operations
 */
export type Condition =
  | SimpleCondition
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }

/**
 * A single branch in an if/else-if chain
 */
export interface BranchCase {
  /** Condition for this branch */
  condition: Condition
  /** Steps to execute when condition is true */
  steps: WorkflowStepMeta[]
}

/**
 * Branch step metadata (if/else-if/else control flow)
 */
export interface BranchStepMeta {
  type: 'branch'
  /** Branches in order: first is "if", rest are "else if" */
  branches: BranchCase[]
  /** Else branch steps (when no conditions match) */
  elseSteps?: WorkflowStepMeta[]
}

/**
 * Parallel group step metadata (Promise.all with multiple steps)
 */
export interface ParallelGroupStepMeta {
  type: 'parallel'
  /** Child steps to execute in parallel */
  children: RpcStepMeta[]
}

/**
 * Fanout step metadata (parallel or sequential iteration)
 */
export interface FanoutStepMeta {
  type: 'fanout'
  /** Step name for this fanout */
  stepName: string
  /** Source array variable name */
  sourceVar: string
  /** Iterator variable name */
  itemVar: string
  /** Execution mode */
  mode: 'parallel' | 'sequential'
  /** Child step to execute per iteration */
  child: RpcStepMeta
  /** Time between iterations (sequential mode only) */
  timeBetween?: string
}

/**
 * Return step metadata (workflow output)
 */
export interface ReturnStepMeta {
  type: 'return'
  /** Output bindings */
  outputs: Record<string, OutputBinding>
}

/**
 * Inline step metadata (legacy support)
 */
export interface InlineStepMeta {
  /** Inline form - local execution */
  type: 'inline'
  /** Cache key (stepName from workflow.do) */
  stepName: string
  /** Display name */
  description?: string
  /** Step options */
  options?: WorkflowStepOptions
}

/**
 * Sleep step metadata
 */
export interface SleepStepMeta {
  /** Sleep step */
  type: 'sleep'
  /** Cache key (stepName from workflow.sleep) */
  stepName: string
  /** Sleep duration */
  duration: string | number
}

/**
 * Cancel step metadata
 */
export interface CancelStepMeta {
  /** Cancel step */
  type: 'cancel'
  /** Optional cancellation reason */
  reason?: string
}

/**
 * Set step metadata (context variable assignment)
 */
export interface SetStepMeta {
  /** Set step */
  type: 'set'
  /** Variable name to set (must be in context) */
  variable: string
  /** Value to assign (literal or expression) */
  value: unknown
}

/**
 * Switch case metadata
 */
export interface SwitchCaseMeta {
  /** Case value (literal) or expression */
  value?: string | number | boolean | null
  /** Case expression (for complex cases) */
  expression?: string
  /** Steps to execute for this case */
  steps: WorkflowStepMeta[]
}

/**
 * Switch step metadata (switch/case control flow)
 */
export interface SwitchStepMeta {
  type: 'switch'
  /** Expression being switched on */
  expression: string
  /** Case branches */
  cases: SwitchCaseMeta[]
  /** Default case steps (optional) */
  defaultSteps?: WorkflowStepMeta[]
}

/**
 * Filter step metadata (array.filter)
 */
export interface FilterStepMeta {
  type: 'filter'
  /** Source array variable name */
  sourceVar: string
  /** Iterator variable name */
  itemVar: string
  /** Filter condition */
  condition: Condition
  /** Output variable name (if assigned) */
  outputVar?: string
}

/**
 * Array predicate step metadata (array.some, array.every)
 */
export interface ArrayPredicateStepMeta {
  type: 'arrayPredicate'
  /** Predicate mode */
  mode: 'some' | 'every'
  /** Source array variable name */
  sourceVar: string
  /** Iterator variable name */
  itemVar: string
  /** Predicate condition */
  condition: Condition
  /** Output variable name (if assigned) */
  outputVar?: string
}

/**
 * Workflow step metadata (extracted by inspector)
 */
export type WorkflowStepMeta =
  | RpcStepMeta
  | BranchStepMeta
  | ParallelGroupStepMeta
  | FanoutStepMeta
  | ReturnStepMeta
  | InlineStepMeta
  | SleepStepMeta
  | CancelStepMeta
  | SwitchStepMeta
  | FilterStepMeta
  | ArrayPredicateStepMeta
  | SetStepMeta

/**
 * Workflow step wire context for RPC functions
 * Provides step-level metadata including retry attempt tracking
 */
export interface WorkflowStepWire {
  /** The workflow run ID */
  runId: string
  /** The unique step ID */
  stepId: string
  /** Current attempt number (1-indexed, increments on retry) */
  attemptCount: number
}

/**
 * Workflow wire object for DSL workflows
 * Provides workflow-specific capabilities to function execution
 */
export interface PikkuWorkflowWire {
  /** The workflow name */
  name: string
  /** The current run ID */
  runId: string
  /** Get the current workflow run */
  getRun: () => Promise<WorkflowRun>

  /** Execute a workflow step (overloaded - RPC or inline form) */
  do: WorkflowWireDoRPC & WorkflowWireDoInline

  /** Sleep for a duration */
  sleep: WorkflowWireSleep

  /** Suspend workflow until explicitly resumed */
  suspend: WorkflowWireSuspend
}
