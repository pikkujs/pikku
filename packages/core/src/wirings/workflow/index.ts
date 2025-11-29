/**
 * Workflow module exports
 */

// Types
export type {
  CoreWorkflow,
  WorkflowStepOptions,
  WorkflowStepMeta,
  RpcStepMeta,
  BranchStepMeta,
  ParallelGroupStepMeta,
  FanoutStepMeta,
  ReturnStepMeta,
  InlineStepMeta,
  SleepStepMeta,
  CancelStepMeta,
  SwitchStepMeta,
  SwitchCaseMeta,
  FilterStepMeta,
  ArrayPredicateStepMeta,
  InputSource,
  OutputBinding,
  Condition,
  SimpleCondition,
  PikkuWorkflowWire,
  PikkuWorkflow,
  WorkflowsMeta,
  WorkflowRuntimeMeta,
  WorkflowsRuntimeMeta,
  WorkflowRun,
  StepState,
  WorkflowStatus,
  StepStatus,
} from './workflow.types.js'

export { PikkuWorkflowService } from './pikku-workflow-service.js'

// Internal registration function (used by generated code)
export { addWorkflow } from './workflow-runner.js'
