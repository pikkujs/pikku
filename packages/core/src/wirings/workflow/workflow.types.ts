import { PikkuDocs, MiddlewareMetadata } from '../../types/core.types.js'
import { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import { WorkflowMeta, WorkflowRun } from './workflow-state.types.js'

/**
 * Core workflow definition
 */
export type CoreWorkflow<
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    any,
    any,
    any
  > = CorePikkuFunctionConfig<any, any, any>,
> = {
  /** Unique workflow name */
  name: string
  /** Description of the workflow */
  description?: string
  /** Execution mode: 'inline' (sync) or 'remote' (queue-based) */
  executionMode?: 'inline' | 'remote' // default: 'remote'
  /** The workflow function */
  func: PikkuFunctionConfig
  /** Middleware chain for this workflow */
  middleware?: PikkuFunctionConfig['middleware']
  /** Permission requirements */
  permissions?: PikkuFunctionConfig['permissions']
  /** Tags for organization and filtering */
  tags?: string[]
  /** Documentation metadata */
  docs?: PikkuDocs
}

/**
 * Workflow step options
 */
export interface WorkflowStepOptions {
  /** Display name for logs/UI (optional, doesn't affect execution) */
  description?: string
  // Future: retries, timeout, failFast, priority
}

/**
 * Workflow step metadata (extracted by inspector)
 */
export type WorkflowStepMeta =
  | {
      /** RPC form - generates queue worker */
      type: 'rpc'
      /** Cache key (stepName from workflow.do) */
      stepName: string | '<dynamic>'
      /** RPC to invoke */
      rpcName: string | '<dynamic>'
      /** Display name */
      description?: string | '<dynamic>'
      /** Step options */
      options?: WorkflowStepOptions
    }
  | {
      /** Inline form - local execution */
      type: 'inline'
      /** Cache key (stepName from workflow.do) */
      stepName: string | '<dynamic>'
      /** Display name */
      description?: string | '<dynamic>'
      /** Step options */
      options?: WorkflowStepOptions
    }
  | {
      /** Sleep step (Phase 2) */
      type: 'sleep'
      /** Sleep duration */
      duration: string | number | '<dynamic>'
      /** Display name */
      description?: string | '<dynamic>'
      /** Step options */
      options?: WorkflowStepOptions
    }

/**
 * Workflow interaction object for middleware
 * Provides workflow-specific capabilities to function execution
 */
export interface PikkuWorkflowInteraction {
  /** The workflow name */
  workflowName: string
  /** The current run ID */
  runId: string
  /** Get the current workflow run */
  getRun: () => Promise<WorkflowRun>

  /**
   * Execute a workflow step - RPC form
   * Generates a dedicated queue worker for isolated execution with retries
   * @param stepName - Cache key for step result (must be deterministic)
   * @param rpcName - Name of the RPC function to invoke
   * @param data - Input data for the RPC
   * @param options - Step options (description, etc.)
   */
  do<TOutput = any, TInput = any>(
    stepName: string,
    rpcName: string,
    data: TInput,
    options?: WorkflowStepOptions
  ): Promise<TOutput>

  /**
   * Execute a workflow step - Inline form
   * Executes locally in orchestrator, result is cached for replay
   * @param stepName - Cache key for step result (must be deterministic)
   * @param fn - Function to execute (must be deterministic)
   * @param options - Step options (description, etc.)
   */
  do<T>(
    stepName: string,
    fn: () => Promise<T> | T,
    options?: WorkflowStepOptions
  ): Promise<T>

  /**
   * Sleep for a duration (Phase 2)
   * @param duration - Sleep duration (ms or duration string)
   * @param options - Step options
   */
  sleep(duration: string | number, options?: WorkflowStepOptions): Promise<void>
}

/**
 * Workflow client interface
 */
export interface PikkuWorkflow {
  /** Start a new workflow run */
  start: <I>(input: I) => Promise<{ runId: string }>
  /** Get a workflow run by ID */
  getRun: (runId: string) => Promise<WorkflowRun>
  /** Cancel a running workflow */
  cancelRun: (runId: string) => Promise<void>
}

/**
 * Workflows metadata for inspector/CLI
 */
export type workflowsMeta = Record<
  string,
  {
    pikkuFuncName: string
    workflowName: string
    executionMode: 'inline' | 'remote'
    description?: string
    session?: undefined
    docs?: PikkuDocs
    tags?: string[]
    middleware?: MiddlewareMetadata[]
    meta: WorkflowMeta
  }
>

/**
 * Exception thrown when workflow needs to pause for async step
 */
export class WorkflowAsyncException extends Error {
  constructor(
    public readonly runId: string,
    public readonly stepName: string
  ) {
    super(`Workflow paused at step: ${stepName}`)
    this.name = 'WorkflowAsyncException'
  }
}
