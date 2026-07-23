import type { SerializedError, CommonWireMeta } from '../../types/core.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { GroupConcurrencyConfig } from '../queue/queue.types.js'

// Re-export WorkflowService from services module
export type { WorkflowService } from '../../services/workflow-service.js'

// Re-export DSL types from dsl module
export type {
  WorkflowStepOptions,
  WorkflowExpectEventuallyOptions,
  WorkflowExpectErrorOptions,
  WorkflowExpectServiceOptions,
  WorkflowWireDoRPC,
  WorkflowWireDoInline,
  WorkflowWireSleep,
  WorkflowWireSuspend,
  WorkflowWireApproval,
  WorkflowApprovalOptions,
  ApprovalOutcome,
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
  SuspendStepMeta,
  ApprovalStepMeta,
  SetStepMeta,
  SwitchCaseMeta,
  SwitchStepMeta,
  FilterStepMeta,
  ArrayPredicateStepMeta,
  WorkflowStepMeta,
  WorkflowStepWire,
  PikkuWorkflowWire,
  PikkuScenarioWire,
} from './dsl/workflow-dsl.types.js'

import type { WorkflowStepMeta } from './dsl/workflow-dsl.types.js'

export interface WorkflowRunWire {
  type: string
  id?: string
  parentRunId?: string
  parentStepId?: string
  /** Pikku user ID propagated from the originating request for credential resolution */
  pikkuUserId?: string
}

export interface WorkflowServiceConfig {
  retries: number
  retryDelay: number
  orchestratorQueueName: string
  stepWorkerQueueName: string
  sleeperRPCName: string
}

/**
 * How a workflow service spreads its jobs across queues.
 *
 * Passed to the service constructor rather than read from `config.workflow`:
 * the queues are wired during construction, before singleton services (and so
 * before `config`) exist.
 */
export interface WorkflowQueueOptions {
  /**
   * - `'per-workflow'` (default) — each workflow gets its own
   *   `wf-orchestrator-*` / `wf-step-*` queue. Complete isolation, and it's
   *   what lets serverless providers deploy one unit per workflow. Costs one
   *   set of pollers per queue, which adds up on pull-based backends.
   * - `'shared-groups'` — every workflow shares the orchestrator/step-worker
   *   queues and stays isolated via {@link queueGroupConcurrency}, so no
   *   workflow can occupy more than its share. One set of pollers total.
   *   Only for single-process (monolith) runtimes; a per-unit serverless
   *   deploy needs the per-workflow queues to route to its units.
   */
  queueStrategy?: 'per-workflow' | 'shared-groups'
  /**
   * Total concurrent workflow jobs per node under `'shared-groups'`.
   * Defaults to 20.
   */
  queueConcurrency?: number
  /**
   * How many jobs of one workflow may run at once under `'shared-groups'`.
   * Defaults to 2. Tiers are keyed by workflow name, so a specific workflow
   * can be given its own limit without any extra wiring.
   *
   * Note tiers can only lower a workflow's limit, not raise it above
   * `default`: the backend's pre-fetch exclusion is applied per group using
   * `default` alone. To give one workflow more room, raise `default` and
   * restrict the others by tier.
   */
  queueGroupConcurrency?: number | GroupConcurrencyConfig
}

export interface WorkflowPlannedStep {
  /** Durable step key — matches the runtime step name stored in the DB */
  stepName: string
  /** Optional human-readable label for the UI timeline (falls back to stepName) */
  displayName?: string
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
 * Workflow version status (for AI-generated workflows)
 */
export type WorkflowVersionStatus = 'draft' | 'active' | 'declined'

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
  /** True when the workflow has a static, pre-computable step timeline */
  deterministic?: boolean
  /** Static planned steps snapshot captured at run start */
  plannedSteps?: WorkflowPlannedStep[]
  /** Wire origin info (how this run was started) */
  wire: WorkflowRunWire
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
  /** Step name of the predecessor that scheduled this step (the transition/edge
   *  walked to reach it); undefined for entry steps. Reconstructs the path. */
  fromStepName?: string
  /** Creation timestamp */
  createdAt: Date
  /** Last update timestamp */
  updatedAt: Date
  /** Child workflow run ID (if this step spawned a sub-workflow) */
  childRunId?: string
  /** Timestamp when step started running */
  runningAt?: Date
  /** Timestamp when step was scheduled */
  scheduledAt?: Date
  /** Timestamp when step succeeded */
  succeededAt?: Date
  /** Timestamp when step failed */
  failedAt?: Date
}

export interface WorkflowRunStatus {
  id: string
  status: WorkflowStatus
  startedAt: Date
  completedAt?: Date
  deterministic?: boolean
  plannedSteps?: WorkflowPlannedStep[]
  steps: Array<{
    name: string
    status: StepStatus
    duration?: number
    /** Number of attempts for this step (1 = first try; > 1 means it retried). */
    attempts?: number
  }>
  output?: unknown
  error?: { message: string }
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
  getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>>
  deleteRun(id: string): Promise<boolean>
}

/**
 * Write-only companion to `WorkflowRunService`. An executor (a
 * `PikkuWorkflowService` subclass) can be given a mirror; every write
 * the executor makes to its own canonical store is then forwarded here,
 * so an external read store (e.g. a DB queried by the console UI) stays
 * in sync with DO/Redis/etc-driven runs.
 *
 * Mirror failures are logged but never fail the workflow — the mirror is
 * an index, not the source of truth.
 */
export interface WorkflowRunMirror {
  createRun(
    runId: string,
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<void>

  updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>

  insertStepState(
    runId: string,
    step: StepState & { stepName: string; rpcName: string | null; data: any }
  ): Promise<void>

  setStepRunning(stepId: string): Promise<void>
  setStepScheduled(stepId: string): Promise<void>
  setStepResult(stepId: string, result: any): Promise<void>
  setStepChildRunId(stepId: string, childRunId: string): Promise<void>
  setStepError(stepId: string, error: SerializedError): Promise<void>

  createRetryAttempt(
    failedStepId: string,
    newStep: StepState & { stepName: string }
  ): Promise<void>

  setBranchTaken(stepId: string, branchKey: string): Promise<void>

  updateRunState(runId: string, name: string, value: unknown): Promise<void>

  upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void>

  updateWorkflowVersionStatus(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void>
}

/**
 * Core workflow definition
 */
export type CoreWorkflow<
  PikkuFunctionConfig extends CorePikkuFunctionConfig<any, any, any> =
    CorePikkuFunctionConfig<any, any, any>,
> = {
  /** Unique workflow name */
  name: string
  /** The workflow function */
  func: PikkuFunctionConfig
  /** Middleware chain for this workflow */
  middleware?: PikkuFunctionConfig['middleware']
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
    expose?: boolean
    /** True for pikkuScenario workflows (complex + actor steps). */
    scenario?: boolean
    /** Actor names a scenario declares (personas it runs steps as). */
    actors?: string[]
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
  /** Source type: 'dsl' (serializable), 'complex' (has inline steps), 'graph', 'scenario' (complex + actor steps) */
  source: 'dsl' | 'complex' | 'graph' | 'dynamic-workflow' | 'scenario'
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Actor names a scenario declares (personas it runs steps as). */
  actors?: string[]
  /** Serialized nodes */
  nodes?: Record<string, any>
  /** Entry node IDs for graph workflows (computed at build time) */
  entryNodeIds?: string[]
  /** Hash of graph topology (nodes, edges, input mappings) */
  graphHash?: string
  /** True when the workflow has a static, pre-computable step timeline */
  deterministic?: boolean
  /** Static planned steps metadata for deterministic workflows */
  plannedSteps?: WorkflowPlannedStep[]
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
  /** Predecessor step name (the walked transition); undefined for entry steps. */
  fromStepName?: string
}

export type WorkflowOrchestratorInput = {
  runId: string
}

export type WorkflowSleeperInput = {
  runId: string
  stepId: string
}
