import {
  SerializedError,
  CoreSingletonServices,
  CreateWireServices,
  CoreConfig,
  CommonWireMeta,
} from '../../types/core.types.js'
import { CorePikkuFunctionConfig } from '../../function/functions.types.js'

// Re-export DSL types from dsl module
export type {
  WorkflowStepOptions,
  WorkflowWireDoRPC,
  WorkflowWireDoInline,
  WorkflowWireSleep,
  InputSource,
  OutputBinding,
  RpcStepMeta,
  SimpleCondition,
  Condition,
  BranchStepMeta,
  ParallelGroupStepMeta,
  FanoutStepMeta,
  ReturnStepMeta,
  InlineStepMeta,
  SleepStepMeta,
  CancelStepMeta,
  SwitchCaseMeta,
  SwitchStepMeta,
  FilterStepMeta,
  ArrayPredicateStepMeta,
  WorkflowStepMeta,
  WorkflowStepWire,
  PikkuWorkflowWire,
} from './dsl/workflow-dsl.types.js'

import type { WorkflowStepMeta } from './dsl/workflow-dsl.types.js'

export interface WorkflowServiceConfig {
  retries: number
  retryDelay: number
  orchestratorQueueName: string
  stepWorkerQueueName: string
  sleeperRPCName: string
}

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
  /** Maximum retry attempts allowed */
  retries?: number
  /** Delay between retries */
  retryDelay?: string | number
  /** Creation timestamp */
  createdAt: Date
  /** Last update timestamp */
  updatedAt: Date
  /** Timestamp when step started running */
  runningAt?: Date
  /** Timestamp when step was scheduled */
  scheduledAt?: Date
  /** Timestamp when step succeeded */
  succeededAt?: Date
  /** Timestamp when step failed */
  failedAt?: Date
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
  /** The workflow function */
  func: PikkuFunctionConfig
  /** Middleware chain for this workflow */
  middleware?: PikkuFunctionConfig['middleware']
  /** Permission requirements */
  permissions?: PikkuFunctionConfig['permissions']
  /** Tags for organization and filtering */
  tags?: string[]
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
 * Workflows metadata for inspector/CLI (DSL step-based format)
 */
export type WorkflowsMeta = Record<
  string,
  CommonWireMeta & {
    workflowName: string
    steps: WorkflowStepMeta[]
    /** Whether this workflow conforms to simple workflow DSL */
    simple?: boolean
  }
>

/**
 * Unified workflow runtime meta (used by runtime to execute workflows)
 * This is the format stored in pikkuState('workflows', 'meta')
 * Both DSL and graph-based workflows are converted to this format
 */
export interface WorkflowRuntimeMeta {
  /** Workflow name (used as key in registrations) */
  name: string
  /** Pikku function name (for execution) */
  pikkuFuncName: string
  /** Source type */
  source?: 'dsl' | 'graph'
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Entry node IDs for graph workflows (computed at build time) */
  entryNodeIds?: string[]
}

/**
 * Unified workflow runtime metadata map
 */
export type WorkflowsRuntimeMeta = Record<string, WorkflowRuntimeMeta>

/**
 * Interface for workflow orchestration
 * Handles workflow execution, replay, orchestration logic, and run-level state
 */
export interface WorkflowService {
  // Run-level state operations
  createRun(workflowName: string, input: any): Promise<string>
  getRun(id: string): Promise<WorkflowRun | null>
  getRunHistory(runId: string): Promise<Array<StepState & { stepName: string }>>
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
    createWireServices: CreateWireServices,
    config: CoreConfig
  ): void
  startWorkflow<I>(
    name: string,
    input: I,
    rpcService: any
  ): Promise<{ runId: string }>
  runWorkflowJob(runId: string, rpcService: any): Promise<void>
  orchestrateWorkflow(runId: string, rpcService: any): Promise<void>
  executeWorkflowSleep(runId: string, stepId: string): Promise<void>

  // Step-level state operations
  insertStepState(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState>
  getStepState(runId: string, stepName: string): Promise<StepState>
  setStepRunning(stepId: string): Promise<void>
  setStepScheduled(stepId: string): Promise<void>
  setStepResult(stepId: string, result: any): Promise<void>
  setStepError(stepId: string, error: Error): Promise<void>
  createRetryAttempt(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>

  // Step execution
  executeWorkflowStep(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    rpcService: any
  ): Promise<void>
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
