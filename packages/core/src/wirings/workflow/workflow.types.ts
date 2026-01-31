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
 * HTTP wire configuration for workflows
 */
export interface WorkflowHTTPWire {
  route: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  startNode: string
}

/**
 * Channel wire configuration for workflows
 */
export interface WorkflowChannelWire {
  name: string
  onConnect?: string
  onDisconnect?: string
  onMessage?: string
}

/**
 * Queue wire configuration for workflows
 */
export interface WorkflowQueueWire {
  name: string
  startNode: string
}

/**
 * CLI wire configuration for workflows
 */
export interface WorkflowCliWire {
  command: string
  startNode: string
}

/**
 * MCP wire configurations for workflows
 */
export interface WorkflowMcpWires {
  tool?: Array<{ name: string; startNode: string }>
  prompt?: Array<{ name: string; startNode: string }>
  resource?: Array<{ uri: string; startNode: string }>
}

/**
 * Trigger wire configuration for workflows
 */
export interface WorkflowTriggerWire {
  name: string
  startNode: string
}

/**
 * Wire configuration for workflows
 * Defines how a workflow can be triggered
 */
export interface WorkflowWires {
  /** API entry point - node ID for startWorkflow() calls */
  api?: string
  /** HTTP triggers */
  http?: WorkflowHTTPWire[]
  /** Channel triggers */
  channel?: WorkflowChannelWire[]
  /** Queue triggers */
  queue?: WorkflowQueueWire[]
  /** CLI triggers */
  cli?: WorkflowCliWire[]
  /** MCP triggers (tool, prompt, resource) */
  mcp?: WorkflowMcpWires
  /** Named trigger wires */
  trigger?: WorkflowTriggerWire[]
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
  /** If true, workflow executes inline without queues */
  inline?: boolean
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
    workflowName: string
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
  pikkuFuncName: string
  /** Source type: 'dsl' (serializable), 'complex' (has inline steps), 'graph' */
  source?: 'dsl' | 'complex' | 'graph'
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Wires - how the workflow is triggered */
  wires?: WorkflowWires
  /** Serialized nodes */
  nodes?: Record<string, any>
  /** Entry node IDs for graph workflows (computed at build time) */
  entryNodeIds?: string[]
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
