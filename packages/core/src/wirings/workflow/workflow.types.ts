import type { SerializedError, CommonWireMeta } from '../../types/core.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionHook,
} from '../../function/functions.types.js'
import type { GroupConcurrencyConfig } from '../queue/queue.types.js'

export type { WorkflowService } from '../../services/workflow-service.js'

export type {
  WorkflowStepOptions,
  WorkflowExpectEventuallyOptions,
  WorkflowExpectErrorOptions,
  WorkflowExpectServiceOptions,
  WorkflowExpectScoreOptions,
  WorkflowWireDoRPC,
  WorkflowWireDoInline,
  WorkflowWireSleep,
  WorkflowWireSuspend,
  WorkflowWireApproval,
  WorkflowApprovalOptions,
  WorkflowApprovalApprovers,
  WorkflowApprovalPolicy,
  ApprovalDecider,
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
  ScenarioStepInvocation,
  ScenarioStepMeta,
  WorkflowStepMeta,
  WorkflowStepWire,
  PikkuWorkflowWire,
  PikkuScenarioWire,
} from './dsl/workflow-dsl.types.js'

export type {
  ScenarioStepPhase,
  ScenarioStepOptions,
  PikkuScenarioStepWire,
  PikkuBrowserWire,
  ScenarioBrowserProvider,
} from './scenario-step.types.js'

import type { WorkflowStepMeta } from './dsl/workflow-dsl.types.js'

export interface WorkflowRunWire {
  type: string
  id?: string
  parentRunId?: string
  parentStepId?: string
  pikkuUserId?: string
}

export interface WorkflowServiceConfig {
  retries: number
  retryDelay: number
  orchestratorQueueName: string
  stepWorkerQueueName: string
  sleeperRPCName: string
}

export interface WorkflowQueueOptions {
  queueStrategy?: 'per-workflow' | 'shared-groups'
  queueConcurrency?: number
  queueGroupConcurrency?: number | GroupConcurrencyConfig
}

export interface WorkflowPlannedStep {
  stepName: string
  displayName?: string
}

export type WorkflowStatus =
  | 'running'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type WorkflowVersionStatus = 'draft' | 'active' | 'declined'

export type StepStatus =
  | 'pending'
  | 'running'
  | 'scheduled'
  | 'succeeded'
  | 'failed'
  | 'suspended'

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
  runningAt?: Date
  scheduledAt?: Date
  succeededAt?: Date
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
  deleteRun(id: string): Promise<boolean>
}

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

export type CoreWorkflow<
  PikkuFunctionConfig extends CorePikkuFunctionConfig<any, any, any> =
    CorePikkuFunctionConfig<any, any, any>,
> = {
  name: string
  func: PikkuFunctionConfig
  middleware?: PikkuFunctionConfig['middleware']
  tags?: string[]
}

export type CoreFeatureScenario =
  | CorePikkuFunctionConfig<any, any, any>
  | { scenario: CorePikkuFunctionConfig<any, any, any>; data: unknown }

export type CoreFeature = {
  name: string
  description?: string
  tags?: string[]
  scenarios: readonly CoreFeatureScenario[]
  before?: CorePikkuFunctionHook
  after?: CorePikkuFunctionHook
}

export type FeatureMetaEntry = {
  scenario: string
  data?: unknown
}

export type FeatureMeta = {
  id: string
  name: string
  description?: string
  tags: string[]
  entries: FeatureMetaEntry[]
  unresolvedEntries: number
  hasBefore: boolean
  hasAfter: boolean
}

export type FeaturesMeta = Record<string, FeatureMeta>

export type FeaturePlanEntry = {
  featureId: string
  featureName: string
  scenarioName: string
  data?: unknown
  tags: string[]
}

export interface PikkuWorkflow {
  start: <I>(input: I) => Promise<{ runId: string }>
  getRun: (runId: string) => Promise<WorkflowRun>
  cancelRun: (runId: string) => Promise<void>
}

export interface ContextVariable {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  default?: unknown
  description?: string
}

export type WorkflowContext = Record<string, ContextVariable>

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
    actors?: string[]
  }
>

export interface WorkflowRuntimeMeta {
  name: string
  pikkuFuncId: string
  source: 'dsl' | 'complex' | 'graph' | 'scenario'
  description?: string
  tags?: string[]
  actors?: string[]
  nodes?: Record<string, any>
  entryNodeIds?: string[]
  graphHash?: string
  deterministic?: boolean
  plannedSteps?: WorkflowPlannedStep[]
}

export type WorkflowsRuntimeMeta = Record<string, WorkflowRuntimeMeta>
