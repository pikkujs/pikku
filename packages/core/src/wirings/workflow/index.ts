/**
 * Workflow module exports
 */
export {
  PikkuWorkflowService,
  WorkflowCancelledException,
  WorkflowSuspendedException,
  WorkflowNotFoundError,
  WorkflowRunNotFoundError,
} from './pikku-workflow-service.js'

// Internal registration functions (used by generated code)
export { addWorkflow } from './dsl/workflow-runner.js'

// Graph helpers (template, pikkuWorkflowGraph)
export { template, type TemplateString } from './graph/template.js'
export {
  pikkuWorkflowGraph,
  type PikkuWorkflowGraphConfig,
  type PikkuWorkflowGraphResult,
} from './graph/wire-workflow-graph.js'

// Workflow helpers (runtime factories for HTTP handlers)
export {
  workflow,
  workflowStart,
  workflowStatus,
  graphStart,
} from './workflow-helpers.js'

// Re-export all types from workflow.types
export type {
  WorkflowService,
  WorkflowServiceConfig,
  WorkflowStatus,
  StepStatus,
  WorkflowRun,
  StepState,
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
} from './workflow.types.js'
