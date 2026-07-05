/**
 * DSL (Domain Specific Language) workflow types
 * These types define the step-based workflow format extracted by the inspector
 */

import type { WorkflowRun } from '../workflow.types.js'
import type { ScenarioActor } from '../../../services/scenario-actors-service.js'

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
  /**
   * Run this step as an actor (scenarios). The RPC is sent through the
   * actor's authenticated client over the REAL transport — never dispatched
   * internally — so auth middleware and permissions are exercised end-to-end.
   * The step is recorded durably like any RPC step.
   */
  actor?: ScenarioActor
  // Future: timeout, failFast, priority
}

/**
 * Options for workflow.expectEventually() — a durable polling step used by
 * scenarios to await async effects (a notification landing, a job finishing).
 */
export interface WorkflowExpectEventuallyOptions extends WorkflowStepOptions {
  /** Give up after this long (e.g. '30s'). Default '30s'. */
  within?: string | number
  /** Poll interval (e.g. '1s'). Default '1s'. */
  interval?: string | number
}

/** Options for workflow.expectError() */
export interface WorkflowExpectErrorOptions extends WorkflowStepOptions {
  /** Assert the error message matches (string = substring match). */
  matches?: string | RegExp
}

/** Options for workflow.expectService() */
export interface WorkflowExpectServiceOptions extends WorkflowStepOptions {
  /** Assert a recorded call's first argument deep-equals this value. */
  calledWith?: unknown
  /** Assert the exact number of matching calls. Default: at least one. */
  times?: number
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
 * Type signature for workflow.suspend() - used by inspector.
 * `reason` is both the human-readable message stored on the suspended run and
 * the suspend point's stable identity (used raw as the durable step name), so a
 * workflow can have multiple independent suspends — including dynamic reasons in
 * loops, like dynamic `do()` step names.
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
  /** Scenario actor name this step runs as ({ actor: actors.x }) */
  actor?: string
  /** True for workflow.expectEventually polling steps */
  expectEventually?: boolean
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
 * Suspend step metadata (workflow.suspend())
 */
export interface SuspendStepMeta {
  type: 'suspend'
  /** Reason string passed to workflow.suspend() — becomes the durable step key */
  reason: string
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
  | SuspendStepMeta
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
  /**
   * The step row ID. Whether it stays the same or is minted fresh per attempt is
   * STORE-SPECIFIC (in-memory mints a new one each attempt; the SQL store reuses
   * the row) — do NOT use it as a dedupe key. Use `invocationId`.
   */
  stepId: string
  /**
   * Stable identity of this step invocation — the idempotency / dedupe key.
   * Identical across every retry of the same call (derived from runId + step
   * name) regardless of storage backend, so a step can `ON CONFLICT (invocationId)`
   * or pass it as an external idempotency key and have retries collapse onto the
   * first attempt.
   */
  invocationId: string
  /** Current attempt number (1-indexed, increments on retry) */
  attemptCount: number
  /**
   * Invocation ID of the predecessor step this one was reached from (the walked
   * transition/edge). Undefined for entry steps. Lets a step know its origin —
   * e.g. in a cyclic graph `a → b → a → c`, the second `a` carries `b`'s id.
   */
  fromInvocationId?: string
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
  /** Pikku user ID propagated from the originating request for credential resolution */
  pikkuUserId?: string
  /** Get the current workflow run */
  getRun: () => Promise<WorkflowRun>

  /** Execute a workflow step (overloaded - RPC or inline form) */
  do: WorkflowWireDoRPC & WorkflowWireDoInline

  /**
   * Durable polling step (scenarios): invoke `rpcName` (as an actor when
   * `options.as` is set) until `predicate` passes or `options.within` elapses.
   */
  expectEventually: <TOutput = any, TInput = any>(
    stepName: string,
    rpcName: string,
    data: TInput,
    predicate: (output: TOutput) => boolean,
    options?: WorkflowExpectEventuallyOptions
  ) => Promise<TOutput>

  /** Error-path step (scenarios): succeeds only when the RPC throws; returns the message */
  expectError: <TInput = any>(
    stepName: string,
    rpcName: string,
    data: TInput,
    options?: WorkflowExpectErrorOptions
  ) => Promise<string>

  /** Stub-assertion step (scenarios): asserts `service.method` was called on the target server */
  expectService: (
    stepName: string,
    serviceMethod: string,
    options?: WorkflowExpectServiceOptions
  ) => Promise<void>

  /** Sleep for a duration */
  sleep: WorkflowWireSleep

  /** Suspend workflow until explicitly resumed */
  suspend: WorkflowWireSuspend
}
