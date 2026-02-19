import { SerializedError, CommonWireMeta } from '../../types/core.types.js'
import { CorePikkuFunctionConfig } from '../../function/functions.types.js'

// Re-export WorkflowService from services module
export type { WorkflowService } from '../../services/workflow-service.js'

// Re-export DSL types from dsl module
export type {
  WorkflowStepOptions,
  WorkflowWireDoRPC,
  WorkflowWireDoInline,
  WorkflowWireSleep,
  WorkflowWireSuspend,
  InputSource,
  OutputBinding,
  RpcStepMeta,
  SimpleCondition,
  Condition,
  BranchCase,
  BranchStepMeta,
  ParallelGroupStepMeta,
  FanoutStepMeta,
  ReturnStepMeta,
  InlineStepMeta,
  SleepStepMeta,
  CancelStepMeta,
  SetStepMeta,
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
export type WorkflowStatus =
  | 'running'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * Workflow step status
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'scheduled'
  | 'succeeded'
  | 'failed'
  | 'suspended'

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
  /** If true, workflow executes inline without queues */
  inline?: boolean
  /** Graph hash of the workflow definition at run creation time */
  graphHash?: string
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

export interface WorkflowRunService {
  listRuns(options?: {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<WorkflowRun[]>
  getRun(id: string): Promise<WorkflowRun | null>
  getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  >
  getRunHistory(runId: string): Promise<Array<StepState & { stepName: string }>>
  getDistinctWorkflowNames(): Promise<string[]>
  getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null>
  deleteRun(id: string): Promise<boolean>
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
 * Context variable definition (serialized from Zod schema or type inference)
 */
export interface ContextVariable {
  /** Variable type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  /** Default value */
  default?: unknown
  /** Description for UI/docs */
  description?: string
}

/**
 * Workflow context - state variables with defaults and types
 */
export type WorkflowContext = Record<string, ContextVariable>

/**
 * Workflows metadata for inspector/CLI (DSL step-based format)
 */
export type WorkflowsMeta = Record<
  string,
  CommonWireMeta & {
    name: string
    steps: WorkflowStepMeta[]
    context?: WorkflowContext
    dsl?: boolean
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
  pikkuFuncId: string
  /** Source type: 'dsl' (serializable), 'complex' (has inline steps), 'graph' */
  source: 'dsl' | 'complex' | 'graph'
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Serialized nodes */
  nodes?: Record<string, any>
  /** Entry node IDs for graph workflows (computed at build time) */
  entryNodeIds?: string[]
  /** Hash of graph topology (nodes, edges, input mappings) */
  graphHash?: string
}

/**
 * Unified workflow runtime metadata map
 */
export type WorkflowsRuntimeMeta = Record<string, WorkflowRuntimeMeta>

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
