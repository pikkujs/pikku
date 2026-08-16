import type { PikkuRawWire } from '../../types/core.types.js'
import type { SerializedError } from '../../errors/serialized-error.js'
import type {
  CoreWorkflow,
  PikkuWorkflowWire,
  StepState,
  WorkflowRun,
  WorkflowStatus,
  WorkflowStepOptions,
} from './workflow.types.js'

export interface RunLifecycleContext {
  runId: string
  run: WorkflowRun
  workflowMeta: any
  workflow: CoreWorkflow
  wire: PikkuRawWire
  packageName: string | null
}

/**
 * The subset of the workflow service a step executor is allowed to call back
 * into.
 */
export interface WorkflowRunEngine {
  inlineStep(
    runId: string,
    logicalStepName: string,
    fn: Function,
    stepOptions?: WorkflowStepOptions,
    data?: any,
    funcName?: string
  ): Promise<any>
  updateRunStatus(
    runId: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>
  onChildWorkflowFailed(run: WorkflowRun, error: unknown): Promise<void>
  verifyStepName(stepName: unknown): void
}

/**
 * Hooks a host may install to decorate runs it did not start. Used by the
 * scenario service to attach its own per-run state.
 */
export interface WorkflowRunExtension {
  attachRunContext(
    runId: string,
    workflowMeta: any,
    options?: Record<string, any>
  ): Promise<void>
  detachRunContext(runId: string): void
  decorateRunWire(
    wire: PikkuRawWire,
    context: {
      runId: string
      workflowMeta: any
      workflowWire: PikkuWorkflowWire
    }
  ): void
  decorateWorkflowWire(
    workflowWire: PikkuWorkflowWire,
    context: {
      name: string
      runId: string
      rpcService: any
      addonNamespace?: string | null
    }
  ): void
  onBeforeRunFunc(context: RunLifecycleContext): Promise<void>
  onAfterRunFunc(
    context: RunLifecycleContext,
    outcome: 'completed' | 'failed' | 'interrupted',
    failure: unknown
  ): Promise<void>
}

/**
 * Per-run bookkeeping held only for the lifetime of an in-process execution.
 */
export type RunContext = {
  activeExecutions: number
  inline?: boolean
  ordinals: Map<string, number>
  lastStep?: string
  replay?: {
    steps?: Map<string, StepState>
    run?: WorkflowRun
  }
}
