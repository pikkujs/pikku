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
  WorkflowRun,
  StepState,
  WorkflowStatus,
  StepStatus,
} from './workflow.types.js'

// WorkflowGraph types (cyclic graph-based workflows)
export type {
  InputValue,
  WorkflowGraphNodeInstance,
  WorkflowGraph,
  GraphContext,
  NodeExecutionResult,
  WorkflowGraphRunState,
  WorkflowGraphExecutionOptions,
  WorkflowGraphValidationError,
  WorkflowGraphValidationResult,
} from './workflow-graph.types.js'

// Path resolver for workflow graph inputs
export {
  parsePath,
  traversePath,
  resolvePath,
  resolveInputValue,
  resolveInputs,
  validatePath,
  type PathResolverContext,
} from './path-resolver.js'

// WorkflowGraph scheduler
export {
  WorkflowGraphScheduler,
  executeWorkflowGraph,
  findTriggerNodes,
  resolveNextInstances,
  MaxIterationsExceededError,
  NoTriggerNodeError,
  InvalidNodeReferenceError,
} from './workflow-graph-scheduler.js'

// Flow functions for workflow graph control flow
export {
  ifConditionFunc,
  switchCaseFunc,
  whileLoopFunc,
  forLoopFunc,
  delayFunc,
  mergeFunc,
  type IfConditionInput,
  type SwitchCaseInput,
  type WhileLoopInput,
  type ForLoopInput,
  type DelayInput,
  type MergeInput,
} from './flow-functions.js'

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
