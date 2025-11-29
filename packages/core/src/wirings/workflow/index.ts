/**
 * Workflow module exports
 */
export {
  PikkuWorkflowService,
  WorkflowCancelledException,
} from './pikku-workflow-service.js'

// Internal registration function (used by generated code)
export { addWorkflow } from './dsl/workflow-runner.js'

// Unified wireWorkflow function
export { wireWorkflow } from './wire-workflow.js'
export type {
  WorkflowDefinition,
  WorkflowDefinitionFunc,
  WorkflowDefinitionGraph,
} from './wire-workflow.js'

// Re-export all types from workflow.types
export type {
  WorkflowService,
  WorkflowServiceConfig,
  WorkflowHTTPWire,
  WorkflowWires,
  WorkflowStatus,
  StepStatus,
  WorkflowRun,
  StepState,
  CoreWorkflow,
  PikkuWorkflow,
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
} from './workflow.types.js'
