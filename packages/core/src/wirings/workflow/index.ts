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
  InputSource,
  OutputBinding,
  Condition,
  SimpleCondition,
  PikkuWorkflowWire,
  PikkuWorkflow,
  WorkflowsMeta,
  WorkflowRun,
  StepState,
  WorkflowStatus,
  StepStatus,
} from './workflow.types.js'

export { PikkuWorkflowService } from './pikku-workflow-service.js'

// Internal registration function (used by generated code)
export { addWorkflow } from './workflow-runner.js'

/**
 * @deprecated This function is no longer used and will be removed in a future release.
 * It exists only for backwards compatibility with generated code.
 * TODO: Remove this export in a future release after updating code generation
 */
export const wireWorkflow = <T extends { name: string; func: any }>(
  workflow: T
): void => {
  // Empty function - no longer used, kept for backwards compatibility
}
