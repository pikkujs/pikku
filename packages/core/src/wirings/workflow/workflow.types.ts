import {
  PikkuDocs,
  MiddlewareMetadata,
  SerializedError,
} from '../../types/core.types.js'
import { CorePikkuFunctionConfig } from '../../function/functions.types.js'

/**
 * Workflow run status
 */
export type WorkflowStatus = 'running' | 'completed' | 'failed'

/**
 * Workflow step status
 */
export type StepStatus = 'pending' | 'scheduled' | 'done' | 'error'

/**
 * Workflow run representation
 */
export interface WorkflowRun {
  /** Unique run ID */
  id: string
  /** Workflow name */
  workflow: string
  /** Current status */
  status: WorkflowStatus
  /** Input data */
  input: any
  /** Output data (if completed) */
  output?: any
  /** Error (if failed) */
  error?: SerializedError
  /** Creation timestamp */
  createdAt: Date
  /** Last update timestamp */
  updatedAt: Date
}

/**
 * Step state representation
 */
export interface StepState {
  /** Unique step ID */
  stepId: string
  /** Step status */
  status: StepStatus
  /** Step result (if done) */
  result?: any
  /** Step error (if error) */
  error?: SerializedError
  /** Creation timestamp */
  createdAt: Date
  /** Last update timestamp */
  updatedAt: Date
}

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
 * Type signature for workflow.do() RPC form - used by inspector
 */
export type WorkflowInteractionDoRPC = <TOutput = any, TInput = any>(
  stepName: string,
  rpcName: string,
  data: TInput,
  options?: WorkflowStepOptions
) => Promise<TOutput>

/**
 * Type signature for workflow.do() inline form - used by inspector
 */
export type WorkflowInteractionDoInline = <T>(
  stepName: string,
  fn: () => Promise<T> | T,
  options?: WorkflowStepOptions
) => Promise<T>

/**
 * Type signature for workflow.sleep() - used by inspector
 */
export type WorkflowInteractionSleep = (
  stepName: string,
  duration: string
) => Promise<void>

/**
 * Workflow step metadata (extracted by inspector)
 */
export type WorkflowStepMeta =
  | {
      /** RPC form - generates queue worker */
      type: 'rpc'
      /** Cache key (stepName from workflow.do) */
      stepName: string
      /** RPC to invoke */
      rpcName: string
      /** Display name */
      description?: string
      /** Step options */
      options?: WorkflowStepOptions
    }
  | {
      /** Inline form - local execution */
      type: 'inline'
      /** Cache key (stepName from workflow.do) */
      stepName: string
      /** Display name */
      description?: string
      /** Step options */
      options?: WorkflowStepOptions
    }
  | {
      /** Sleep step */
      type: 'sleep'
      /** Cache key (stepName from workflow.sleep) */
      stepName: string
      /** Sleep duration */
      duration: string | number
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

  /** Execute a workflow step (overloaded - RPC or inline form) */
  do: WorkflowInteractionDoRPC & WorkflowInteractionDoInline

  /** Sleep for a duration */
  sleep: WorkflowInteractionSleep
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
export type WorkflowsMeta = Record<
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
    steps: WorkflowStepMeta[]
  }
>
