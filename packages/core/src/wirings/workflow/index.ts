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
export type {
  RunLifecycleContext,
  WorkflowRunEngine,
  WorkflowRunExtension,
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
export { addFeature, resolveFeatureScenarios } from './feature.js'

// Graph helpers (template, pikkuWorkflowGraph)
export { template, type TemplateString } from './graph/template.js'
export {
  pikkuWorkflowGraph,
  type PikkuWorkflowGraphConfig,
  type PikkuWorkflowGraphResult,
} from './graph/wire-workflow-graph.js'

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
  CoreFeature,
  CoreFeatureScenario,
  FeatureMeta,
  FeatureMetaEntry,
  FeaturesMeta,
  FeaturePlanEntry,
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
  ScenarioStepInvocation,
  ScenarioStepMeta,
  WorkflowStepMeta,
  WorkflowStepWire,
  PikkuWorkflowWire,
  PikkuScenarioWire,
} from './workflow.types.js'

/* ------------------------------------------------------------------ *
 * Scenarios — writing a step
 *
 * What a step file imports. Everything here is reached from inside a
 * `pikkuScenarioStep` body.
 * ------------------------------------------------------------------ */

// The step's own wire, and the shape of what it was given
export type {
  ScenarioStepPhase,
  ScenarioStepOptions,
  PikkuScenarioStepWire,
  ScenarioEnvironment,
  ScenarioSurface,
  ScenarioSurfaceResolution,
} from './scenario-step.types.js'
export { SCENARIO_SURFACES } from './scenario-step.types.js'

// Which of a step's bindings run: one for an action, every witness for a `then`
export {
  resolveScenarioSurfaces,
  witnessesAgree,
} from './scenario-surface.js'

// Narrows the optional halves of the step wire, with a message that says what to do
export { requireActor, requireScenarioEnv } from './scenario-step-guards.js'

// Waits for the target to catch up, without every step writing the loop again
export { pollUntil, type PollOptions } from './scenario-poll.js'

// Persists cookies across a step's requests, the way a browser would
export { createCookieJar } from './scenario-cookie-jar.js'
export type { ScenarioCookieJar } from './scenario-cookie-jar.js'

// What the transport answered — an actor's `invokeRaw`, or a route reached
// directly — and the one way to POST JSON at a route and keep its status
export type {
  ScenarioHttpResponse,
  ScenarioJsonRequest,
} from '../../services/scenario-actors-service.js'
export {
  readScenarioHttpResponse,
  postScenarioJson,
} from '../../services/scenario-actors-service.js'

/* ------------------------------------------------------------------ *
 * Scenarios — driving a browser
 *
 * How a step names an element, and what a driver package
 * (`@pikku/playwright`, or another) implements.
 * ------------------------------------------------------------------ */

export type {
  PikkuBrowserWire,
  TestIdSelector,
  ScenarioBrowserProvider,
  ScenarioBrowserFailure,
} from './scenario-step.types.js'

/* ------------------------------------------------------------------ *
 * Scenarios — reporting a run
 *
 * Used by the CLI reporter and the console, so the two render the same
 * sentence for the same step. A step body needs none of it.
 * ------------------------------------------------------------------ */

export { composeStepProse, renderStepTemplate } from './scenario-prose.js'
