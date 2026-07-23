/**
 * Workflow module exports
 */
export {
  PikkuWorkflowService,
  WorkflowCancelledException,
  WorkflowSuspendedException,
  WorkflowDispatchException,
  WorkflowNotFoundError,
  WorkflowRunNotFoundError,
  WorkflowApprovalResolvedError,
  DEFAULT_STEP_RETRIES,
} from './pikku-workflow-service.js'
export { deriveInvocationId, uuidv5 } from './workflow-invocation-id.js'

// Time-travel: reconstruct run state at any point from durable history
export {
  buildRunTimeline,
  reconstructStateAt,
  reconstructFinalState,
} from './run-timeline.js'
export type {
  RunTimeline,
  RunTimelineEvent,
  ReconstructedRunState,
  ReconstructedStep,
  RunPhase,
} from './run-timeline.js'

// Internal registration functions (used by generated code)
export { addWorkflow } from './dsl/workflow-runner.js'

// Graph helpers (template, pikkuWorkflowGraph)
export { template, type TemplateString } from './graph/template.js'
export {
  pikkuWorkflowGraph,
  type PikkuWorkflowGraphConfig,
  type PikkuWorkflowGraphResult,
} from './graph/wire-workflow-graph.js'

// Graph validation and dynamic workflow utilities
export {
  validateWorkflowWiring,
  computeEntryNodeIds,
} from './graph/graph-validation.js'

// Queue worker functions (registered by codegen, executed at runtime)
export {
  pikkuWorkflowWorkerFunc,
  pikkuWorkflowOrchestratorFunc,
  pikkuWorkflowSleeperFunc,
} from './workflow-queue-workers.js'
export type {
  WorkflowStepInput as WorkflowStepQueueInput,
  PikkuWorkflowOrchestratorInput,
  PikkuWorkflowSleeperInput,
} from './workflow-queue-workers.js'

// Re-export all types from workflow.types
export type {
  WorkflowService,
  WorkflowQueueOptions,
  WorkflowServiceConfig,
  WorkflowPlannedStep,
  WorkflowRunWire,
  WorkflowStatus,
  WorkflowVersionStatus,
  StepStatus,
  WorkflowRun,
  WorkflowRunStatus,
  StepState,
  WorkflowRunService,
  WorkflowRunMirror,
  CoreWorkflow,
  PikkuWorkflow,
  ContextVariable,
  WorkflowContext,
  WorkflowsMeta,
  WorkflowRuntimeMeta,
  WorkflowsRuntimeMeta,
  WorkflowStepInput,
  WorkflowOrchestratorInput,
  WorkflowSleeperInput,
} from './workflow.types.js'

// Re-export DSL types
export type {
  WorkflowStepOptions,
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
} from './workflow.types.js'
