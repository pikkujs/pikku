import type { CommonWireMeta } from '../../types/core.types.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { GroupConcurrencyConfig } from '../queue/queue.types.js'
import type { LeaseService } from '../../services/lease-service.js'

export type { WorkflowService } from '../../services/workflow-service.js'

export type {
  WorkflowStepOptions,
  WorkflowWireDoRPC,
  WorkflowApprovalOptions,
  ApprovalOutcome,
  InputSource,
  OutputBinding,
  RpcStepMeta,
  Condition,
  BranchStepMeta,
  ParallelGroupStepMeta,
  FanoutStepMeta,
  ReturnStepMeta,
  InlineStepMeta,
  SleepStepMeta,
  CancelStepMeta,
  SuspendStepMeta,
  MilestoneStepMeta,
  ApprovalStepMeta,
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

/**
 * How a run was started: the wire type, the parent run and step for a child
 * workflow, and the user whose session started it — who becomes its owner.
 */
export interface WorkflowRunWire {
  type: string
  id?: string
  parentRunId?: string
  parentStepId?: string
  pikkuUserId?: string
}

/**
 * The resolved `workflow` section of the app config: default retries and the queue names the engine uses.
 */
export interface WorkflowServiceConfig {
  retries: number
  retryDelay: number
  orchestratorQueueName: string
  stepWorkerQueueName: string
  sleeperRPCName: string
}

/**
 * How a workflow service routes its jobs. `per-workflow` (the default) uses a
 * workflow's dedicated queue when one is declared; `shared-groups` sends every
 * job through the shared queues, grouped by workflow, with
 * `queueGroupConcurrency` (default 2) per group. `queueConcurrency` defaults
 * to 20.
 */
export interface WorkflowQueueOptions {
  queueStrategy?: 'per-workflow' | 'shared-groups'
  queueConcurrency?: number
  queueGroupConcurrency?: number | GroupConcurrencyConfig
}

/**
 * What a workflow service over a shared store is built with. Every process that
 * can reach the store may orchestrate the same run or claim the same step, so
 * the service serialises both on `leaseService` — the same one the app
 * registers, whatever store it is backed by.
 */
export interface WorkflowServiceOptions extends WorkflowQueueOptions {
  leaseService: LeaseService
}

/** A step a deterministic workflow is known to run, before it runs. */
export interface WorkflowPlannedStep {
  stepName: string
  displayName?: string
}

/**
 * Where a run stands. `compensating` and the two after it belong to a saga unwinding after a failure.
 */
export type WorkflowStatus =
  | 'running'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'compensating'
  | 'compensated'
  | 'compensation_failed'

/** Whether a recorded version of a workflow's graph may be run. */
export type WorkflowVersionStatus = 'draft' | 'active' | 'declined'

/** Where one step attempt stands. */
export type StepStatus =
  'pending' | 'running' | 'scheduled' | 'succeeded' | 'failed' | 'suspended'

/** One stored workflow run. */
export interface WorkflowRun {
  id: string
  workflow: string
  status: WorkflowStatus
  input: any
  output?: any
  error?: SerializedError
  inline?: boolean
  graphHash?: string
  deterministic?: boolean
  plannedSteps?: WorkflowPlannedStep[]
  wire: WorkflowRunWire
  createdAt: Date
  updatedAt: Date
}

/** One stored attempt at a workflow step. */
export interface StepState {
  stepId: string
  status: StepStatus
  /**
   * The function the workflow dispatched this step with, recorded so a worker
   * can reject a queue message naming anything else. `null` is a step with no
   * function of its own (inline work); `undefined` is a store that never
   * recorded one, and cannot be compared against.
   */
  rpcName?: string | null
  result?: any
  error?: SerializedError
  attemptCount: number
  retries?: number
  retryDelay?: string | number
  fromStepName?: string
  createdAt: Date
  updatedAt: Date
  childRunId?: string
  /** True for the row that undoes `<stepName>` rather than running it. */
  compensating?: boolean
  /**
   * When the dispatch that claimed this step stops owning it. The holder pushes
   * it forward while it is still working, so a lapsed lease means the worker is
   * gone and the step may be claimed again. `undefined` is a store that keeps no
   * lease, where a `running` step is owned until it moves on its own.
   */
  leaseExpiresAt?: Date
  runningAt?: Date
  scheduledAt?: Date
  succeededAt?: Date
  failedAt?: Date
}

/** A run summarised for display: status, steps and outcome. */
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
    attempts?: number
  }>
  output?: unknown
  error?: { message: string }
  restedAt?: string
  stuckSteps?: Array<{ stepName: string; error: string }>
}

/**
 * Read and delete access to stored workflow runs, for consoles and status
 * routes. It applies no ownership check of its own: callers that expose it to
 * users check with `assertWorkflowRunOwner` first.
 */
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
 * A secondary store that receives a copy of every write a workflow service
 * makes — for reporting or a console database. A failed mirror write is logged
 * and ignored, and the engine never reads from it.
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

/** A registered workflow: its name and the function that runs it. */
export type CoreWorkflow<
  PikkuFunctionConfig extends CorePikkuFunctionConfig<any, any, any> =
    CorePikkuFunctionConfig<any, any, any>,
> = {
  name: string
  func: PikkuFunctionConfig
  middleware?: PikkuFunctionConfig['middleware']
  tags?: string[]
}

/** Start, read and cancel runs of one workflow. */
export interface PikkuWorkflow {
  start: <I>(input: I) => Promise<{ runId: string }>
  getRun: (runId: string) => Promise<WorkflowRun>
  cancelRun: (runId: string) => Promise<void>
}

/** One declared workflow context variable: its type, default and description. */
export interface ContextVariable {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  default?: unknown
  description?: string
}

/** A workflow's declared context variables, keyed by name. */
export type WorkflowContext = Record<string, ContextVariable>

/** Generated metadata for every workflow, keyed by name. */
export type WorkflowsMeta = Record<
  string,
  CommonWireMeta & {
    name: string
    steps: WorkflowStepMeta[]
    context?: WorkflowContext
    dsl?: boolean
    expose?: boolean
    scenario?: boolean
    /**
     * The flow asserts through an expectation helper — `expectService`,
     * `expectError`, `expectEventually` — rather than a `then` step. Those are
     * inline steps and carry no phase, so without this PKU680 reads a scenario
     * whose only witness is a recorded service call as asserting nothing.
     */
    asserts?: boolean
    skip?: string
    virtualUsers?: string[]
  }
>

/** The slice of a workflow's generated metadata the engine needs at run time. */
export interface WorkflowRuntimeMeta {
  name: string
  pikkuFuncId: string
  source: 'dsl' | 'complex' | 'graph' | 'scenario'
  description?: string
  tags?: string[]
  virtualUsers?: string[]
  nodes?: Record<string, any>
  entryNodeIds?: string[]
  graphHash?: string
  deterministic?: boolean
  plannedSteps?: WorkflowPlannedStep[]
}

/** Runtime workflow metadata, keyed by name. */
export type WorkflowsRuntimeMeta = Record<string, WorkflowRuntimeMeta>
