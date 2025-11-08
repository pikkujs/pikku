import {
  PikkuDocs,
  MiddlewareMetadata,
  SerializedError,
  CoreSingletonServices,
  CreateSessionServices,
} from '../../types/core.types.js'
import { CorePikkuFunctionConfig } from '../../function/functions.types.js'

/**
 * Workflow run status
 */
export type WorkflowStatus = 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Workflow step status
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'scheduled'
  | 'succeeded'
  | 'failed'

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
  /** Number of attempts made (starts at 1) */
  attemptCount: number
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
  /** Number of retry attempts for failed steps (only applies to local execution) */
  retries?: number
  /** Delay between retry attempts (e.g., '1s', '500ms', '2min') */
  retryDelay?: string | number
  // Future: timeout, failFast, priority
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
 * Workflow step interaction context for RPC functions
 * Provides step-level metadata including retry attempt tracking
 */
export interface WorkflowStepInteraction {
  /** The workflow run ID */
  runId: string
  /** The unique step ID */
  stepId: string
  /** Current attempt number (1-indexed, increments on retry) */
  attemptCount: number
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

  /** Cancel the current workflow run */
  cancel: (reason?: string) => Promise<never>
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
    description?: string
    session?: undefined
    docs?: PikkuDocs
    tags?: string[]
    middleware?: MiddlewareMetadata[]
    steps: WorkflowStepMeta[]
  }
>

/**
 * Interface for workflow orchestration
 * Handles workflow execution, replay, orchestration logic, and run-level state
 */
export interface WorkflowOrchestratorService {
  // Run-level state operations
  createRun(workflowName: string, input: any): Promise<string>
  getRun(id: string): Promise<WorkflowRun | null>
  updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>
  withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T>
  close(): Promise<void>

  // Orchestration operations
  resumeWorkflow(runId: string): Promise<void>
  setServices(
    singletonServices: CoreSingletonServices,
    createSessionServices: CreateSessionServices
  ): void
  startWorkflow<I>(
    name: string,
    input: I,
    rpcService: any
  ): Promise<{ runId: string }>
  runWorkflowJob(runId: string, rpcService: any): Promise<void>
  orchestrateWorkflow(
    data: WorkflowOrchestratorInput,
    rpcService: any
  ): Promise<void>
  executeWorkflowSleep(data: WorkflowSleeperInput): Promise<void>
}

/**
 * Worker input types for generated queue workers
 */
export type WorkflowStepInput = {
  runId: string
  stepName: string
  rpcName: string
  data: any
}

export type WorkflowOrchestratorInput = {
  runId: string
}

export type WorkflowSleeperInput = {
  runId: string
  stepId: string
}

/**
 * Interface for workflow step execution
 * Handles individual step execution, step-level state, and retry logic
 */
export interface WorkflowStepService {
  // Step-level state operations
  getStepState(runId: string, stepName: string): Promise<StepState>
  setStepScheduled(stepId: string): Promise<void>
  setStepResult(stepId: string, result: any): Promise<void>
  setStepError(stepId: string, error: Error): Promise<void>
  createRetryAttempt(stepId: string): Promise<StepState>

  // Step execution
  executeWorkflowStep(data: WorkflowStepInput, rpcService: any): Promise<void>
}
